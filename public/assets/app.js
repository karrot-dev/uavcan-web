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
    <ul class="nav-list">
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

const UApp = {
  template: `
    <div>
      <nav class="navbar" role="navigation" aria-label="main navigation">
        <div class="navbar-brand">
          <span class="navbar-item">
            <img class="kanthaus-logo" src="https://assets.gitlab-static.net/uploads/-/system/group/avatar/1902422/prototype.png?width=68" width="112" height="28">
          </span>
          <router-link class="navbar-item" :to="{ name: 'dashboard' }">dashboard</router-link>
          <router-link class="navbar-item" :to="{ name: 'heater' }">heater</router-link>
          <router-link class="navbar-item" :to="{ name: 'debug' }">debug</router-link>
        </div>
      </nav>

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
  <div class="UFanControl">
    <form @submit="submit">

      <div class="field">
        <label class="label is-large">Fan speed</label>
        <div class="control">
          <input class="input is-large" type="number" min="0" max="100" v-model.number="dutyCycleEdit">
        </div>
      </div>

      <div class="field">
        <label class="checkbox">
        <input type="checkbox" v-model="setOptimalPeriodInHalfWaves">
        set period to {{ suggested.periodInHalfWaves }} (effective fan speed {{ roundTo2DP(suggested.dutyCycle) }}%)
        </label>
      </div>

      <div class="field is-grouped is-grouped-right">
        <p class="control">
          <button class="button is-large" @click.stop.prevent="refresh">refresh</button>
        </p>
        <p class="control">
          <button class="button is-large" :class="{ 'is-primary': hasChanged }" :disabled="!hasChanged" type="submit">set</button>
        </p>
      </div>

      <div class="current">
        current period is {{ periodInHalfWaves }}, effective fan speed is {{ roundTo2DP(effectiveDutyCycle) }}%
      </div>
    </form>
  </div>
  `
}
const UHeaterControl = {
  data() {
    return {
      nodeId: 9,
      heaterStartParam: 'CONFIG_HEATER_TIME_1_START',
      heaterStartTime: null,
      heaterStartTimeEdit: null,
      heaterStopParam: 'CONFIG_HEATER_TIME_1_STOP',
      heaterStopTime: null,
      heaterStopTimeEdit: null,
    }
  },
  created() {
    this.refresh()
  },
  methods: {
    async submit() {
      const heaterStartResult = await setNodeParam(this.nodeId, this.heaterStartParam, parseInt(this.heaterStartTimeEdit, 10))
      this.heaterStartTime = this.heaterStartTimeEdit = heaterStartResult.value.integer_value
      const heaterStopResult = await setNodeParam(this.nodeId, this.heaterStopParam, parseInt(this.heaterStopTimeEdit, 10))
      this.heaterStopTime = this.heaterStopTimeEdit = heaterStopResult.value.integer_value
    },
    async refresh() {
      this.heaterStartTime = this.heaterStartTimeEdit = (await fetchNodeParam(this.nodeId, this.heaterStartParam)).value.integer_value
      this.heaterStopTime = this.heaterStopTimeEdit = (await fetchNodeParam(this.nodeId, this.heaterStopParam)).value.integer_value
    },
    roundTo2DP(num) {
      return Math.round(num * 100) / 100
    },
  },
  computed: {
    hasChanged () {
      return this.heaterStartTime !== this.heaterStartTimeEdit || this.heaterStopTime !== this.heaterStopTimeEdit
    },
  },
  template: `
  <div class="UHeaterControl">
    <form @submit="submit">

      <div class="field">
        <label class="label is-large">Heater Start Time</label>
        <div class="control">
          <input class="input is-large" type="number" v-model.number="heaterStartTimeEdit">
        </div>
      </div>

    <div class="field">
      <label class="label is-large">Heater Stop Time</label>
      <div class="control">
        <input class="input is-large" type="number" v-model.number="heaterStopTimeEdit">
      </div>
    </div>

      <div class="field is-grouped is-grouped-right">
        <p class="control">
          <button class="button is-large" @click.stop.prevent="refresh">refresh</button>
        </p>
        <p class="control">
          <button class="button is-large" :class="{ 'is-primary': hasChanged }" :disabled="!hasChanged" type="submit">set</button>
        </p>
      </div>
    </form>
  </div>
  `
}

const UHome = {
  components: {UFanControl},
  template: `
    <div>
      <UFanControl/>
    </div>
  `
}

const UHeater = {
  components: {UHeaterControl},
  template: `
    <div>
      <UHeaterControl/>
    </div>
  `
}

const UDebug = {
  components: {UNodeList},
  template: `
    <div>
      <UNodeList/>
      <RouterView></RouterView>
    </div>
  `
}

const routes = [
  {
    path: '/',
    component: UHome,
    name: 'dashboard',
  },
  {
    path: '/heater',
    component: UHeater,
    name: 'heater',
  },
  {
    path: '/debug',
    component: UDebug,
    name: 'debug',
    children: [
      {
        path: 'nodes/:nodeId',
        component: UNodeDetailPage,
        name: 'nodeDetail',
      },
    ]
  },
]

start(UApp, routes)