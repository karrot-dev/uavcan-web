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

const UHome = {
  template: `<p>Hello</p>`
}

const routes = [
  {path: '/', component: UHome, name: 'home'},
  {path: '/nodes/:nodeId', component: UNodeDetailPage, name: 'nodeDetail'},
]

start(UApp, routes)