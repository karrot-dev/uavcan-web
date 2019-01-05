async function fetchNodeList (options = {}) {
  const res = await fetch('/api/nodes', options)
  const data = await res.json()
  return data.nodes.sort((a, b) => a.id - b.id)
}

async function fetchNodeDetail (nodeId, options = {}) {
  const res = await fetch(`/api/nodes/${nodeId}`, options)
  const data = await res.json()
  return data
}

async function fetchNodeParams (nodeId, options = {}) {
  const res = await fetch (`/api/nodes/${nodeId}/params`, options)
  const data = await res.json()
  return data
}

async function fetchNodeParam (nodeId, param, options = {}) {
  const res = await fetch (`/api/nodes/${nodeId}/params/${param}`, options)
  const data = await res.json()
  return data
}

async function setNodeParam (nodeId, param, value, options = {}) {
  const res = await fetch (`/api/nodes/${nodeId}/params/${param}`,{
    ...options,
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({value})
  })
  const data = await res.json()
  return data
}

async function start (Component, routes) {
  const router = new VueRouter({routes})
  const app = new Vue({
    router,
    render: h => h(Component)
  }).$mount('#app')
}

const UNodeList = {
  data () {
    return {
      nodes: []
    }
  },
  async created () {
    this.nodes = await fetchNodeList()
  },
  template: `
    <ul class="UNodeList">
      <li>
        <router-link :to="{ name: 'dashboard' }">dashboard</router-link>
      </li>
      <li v-for="node in nodes">
        <router-link :to="{ name: 'nodeDetail', params: { nodeId: node.id } }">node {{ node.id }}</router-link>
      </li>
    </ul>
  `
}

function isAbortError(err) {
  return err.name === 'AbortError'
}

const UNodeDetail = {
  props: {
    nodeId: {
      type: Number,
      required: true
    },
  },
  data () {
    return {
      hideZeroValues: true,
      nodeDetail: null,
      nodeParams: null,
      errors: [],
      abortController: null
    }
  },
  created () {
    this.refresh()
  },
  watch: {
    nodeId() {
      this.refresh()
    }
  },
  methods: {
    async refresh() {
      if (this.abortController) {
        this.abortController.abort()
      }
      this.abortController = new AbortController()
      this.nodeDetail = null
      this.nodeParams = null
      this.errors = []
      try {
        this.nodeDetail = await fetchNodeDetail(this.nodeId, {signal: this.abortController.signal})
      } catch (err) {
        if (!isAbortError(err)) {
          this.errors.push(err)
        }
      }
      try {
        this.nodeParams = await fetchNodeParams(this.nodeId, {signal: this.abortController.signal})
      } catch (err) {
        if (!isAbortError(err)) {
          this.errors.push(err)
        }
      }
    }
  },
  template: `
    <div v-if="nodeDetail" class="UNodeDetail">
      <h1>{{ nodeDetail.name }}</h1>
      <label><input type="checkbox" v-model="hideZeroValues"> hide zero values</label>
      <table class="node-params">
        <tr v-for="param in nodeParams" v-if="!hideZeroValues || param.value !== 0">
          <th>{{ param.name }}</th>
          <td>{{ param.value }}</td>
        </tr>
      </table>
      <div v-if="errors.length > 0">
        <div v-for="error in errors" class="error">
          {{ error.message }}
        </div>
      </div>
    </div>
  `
}

const UNodeDetailPage = {
  components: {UNodeDetail},
  data () {
    return {
      nodeId: null
    }
  },
  async beforeRouteUpdate (to, from, next) {
    this.nodeId = to.params.nodeId
    next()
  },
  created () {
    this.nodeId = this.$route.params.nodeId
  },
  template: `<UNodeDetail v-if="nodeId" :nodeId="nodeId"/>`
}

const UNav = {
  components: {UNodeList},
  template: `
    <div class="UNav">
      <UNodeList/>
    </div>
  `
}

const UApp = {
  components: {UNav},
  template: `
    <div>
      <UNav/>
      <RouterView></RouterView>
    </div>
  `
}

function calculateEffectiveDutyCycle(intendedDutyCycle, periodInHalfWaves) {
  return 100 * Math.floor((intendedDutyCycle * periodInHalfWaves) / 100) / periodInHalfWaves
}

function calculateBestOptions(intendedDutyCycle) {
  const minPeriodInHalfWaves = 5
  const maxPeriodInHalfWaves = 19
  let periodInHalfWaves = minPeriodInHalfWaves
  const options = []
  while (periodInHalfWaves < maxPeriodInHalfWaves) {
    const dutyCycle = calculateEffectiveDutyCycle(intendedDutyCycle, periodInHalfWaves)
    options.push({
      periodInHalfWaves,
      dutyCycle,
      diff: Math.abs(intendedDutyCycle - dutyCycle)
    })
    periodInHalfWaves += 2 // only odd numbers
  }
  return options.sort((a, b) => a.diff - b.diff)[0]
}

const UFanControl = {
  data() {
    return {
      nodeId: 10,
      setOptimalPeriodInHalfWaves: true,
      dutyCycleParam: 'CONFIG_DIMMER_DUTY_CYCLE',
      dutyCycle: null,
      dutyCycleEdit: null,
      periodInHalfWavesParam: 'CONFIG_DIMMER_PERIOD_IN_HALFWAVES',
      periodInHalfWaves: null
    }
  },
  created() {
    this.refresh()
  },
  methods: {
    async submit() {
      const dutyCycleResult = await setNodeParam(this.nodeId, this.dutyCycleParam, parseInt(this.dutyCycleEdit, 10))
      this.dutyCycle = dutyCycleResult.value.integer_value
      this.dutyCycleEdit = this.dutyCycle

      if (this.setOptimalPeriodInHalfWaves) {
        const {periodInHalfWaves} = calculateBestOptions(this.dutyCycle)
        const periodInHalfWavesResult = await setNodeParam(this.nodeId, this.periodInHalfWavesParam, periodInHalfWaves)
        this.periodInHalfWaves = periodInHalfWavesResult.value.integer_value
      }
    },
    async refresh() {
      this.dutyCycle = (await fetchNodeParam(this.nodeId, this.dutyCycleParam)).value.integer_value
      this.dutyCycleEdit = this.dutyCycle
      this.periodInHalfWaves = (await fetchNodeParam(this.nodeId, this.periodInHalfWavesParam)).value.integer_value
    },
    roundTo2DP(num) {
      return Math.round(num * 100) / 100
    }
  },
  computed: {
    hasChanged () {
      return this.dutyCycle !== this.dutyCycleEdit
    },
    effectiveDutyCycle() {
      if (this.dutyCycle === null || this.periodInHalfWaves === null) return
      return calculateEffectiveDutyCycle(this.dutyCycle, this.periodInHalfWaves)
    },
    suggested () {
      return calculateBestOptions(this.dutyCycleEdit)
    }
  },
  template: `
  <div class="UFanControl" :class="{ changed: hasChanged }">
    <form @submit="submit">
      <label>Fan Speed [%]</label> <input type="number" min="0" max="100" v-model.number="dutyCycleEdit">
      <button type="submit">set</button>
      <button @click.stop.prevent="refresh">refresh</button>
      <br/>
      <label>
        <input type="checkbox" v-model="setOptimalPeriodInHalfWaves">
        set period to {{ suggested.periodInHalfWaves }} (effective fan speed {{ roundTo2DP(suggested.dutyCycle) }}%)
      </label>
      <div class="current">
        current period is {{ periodInHalfWaves }}, effective fan speed is {{ roundTo2DP(effectiveDutyCycle) }}%
      </div>
    </form>
  </div>
  `
}
const UHome = {
  components: {UFanControl},
  template: `
    <div>
      <h3>Dashboard</h3>
      <UFanControl/>
    </div>
  `
}

const routes = [
  {path: '/', component: UHome, name: 'dashboard'},
  {path: '/nodes/:nodeId', component: UNodeDetailPage, name: 'nodeDetail'},
]

start(UApp, routes)