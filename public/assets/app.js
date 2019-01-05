async function fetchNodeList () {
  const res = await fetch('/api/nodes')
  const data = await res.json()
  return data.nodes.sort((a, b) => a.id - b.id)
}

async function fetchNodeDetail (nodeId) {
  const res = await fetch(`/api/nodes/${nodeId}`)
  const data = await res.json()
  return data
}

async function fetchNodeParams (nodeId) {
  const res = await fetch (`/api/nodes/${nodeId}/params`)
  const data = await res.json()
  return data
}

async function fetchNodeParam (nodeId, param) {
  const res = await fetch (`/api/nodes/${nodeId}/params/${param}`)
  const data = await res.json()
  return data
}

async function setNodeParam (nodeId, param, value) {
  const res = await fetch (`/api/nodes/${nodeId}/params/${param}`,{
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
      <li v-for="node in nodes">
        <router-link :to="{ name: 'nodeDetail', params: { nodeId: node.id } }">node {{ node.id }}</router-link>
      </li>
    </ul>
  `
}

const UNodeDetail = {
  props: {
    nodeDetail: {
      type: Object,
      required: false
    },
    nodeParams: {
      type: Object,
      required: false
    }
  },
  template: `
    <div v-if="nodeDetail" class="UNodeDetail">
      <h1>{{ nodeDetail.name }}</h1>
      <pre>{{ nodeParams }}</pre>
      <pre>{{ nodeDetail }}</pre>
    </div>
  `
}

const UNodeDetailPage = {
  components: {UNodeDetail},
  data () {
    return {
      nodeDetail: null,
      nodeParams: null,
    }
  },
  async beforeRouteUpdate (to, from, next) {
    this.updateNodeDetail(to.params.nodeId)
    next()
  },
  created () {
    this.updateNodeDetail(this.$route.params.nodeId)
  },
  methods: {
    async updateNodeDetail (nodeId) {
      this.nodeDetail = null
      this.nodeParams = null
      this.nodeDetail = await fetchNodeDetail(nodeId)
      this.nodeParams = await fetchNodeParams(nodeId)
    }
  },
  template: `<UNodeDetail :nodeDetail="nodeDetail" :nodeParams="nodeParams"/>`
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
  {path: '/', component: UHome, name: 'home'},
  {path: '/nodes/:nodeId', component: UNodeDetailPage, name: 'nodeDetail'},
]

start(UApp, routes)