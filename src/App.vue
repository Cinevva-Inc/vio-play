<template>
  <div class="viewport" ref="viewport" id="viewport">
    <div class="discord" v-if="discord">
      <div class="leaderboard">
        <label>Leaderboard</label>
        <ul>
          <li v-for="entry in leaderboard">
            {{entry.user}} – {{entry.score}} points {{entry.online ? '– playing now!' : ''}}
          </li>
        </ul>
      </div>
    </div>
    <div class="cinevva" v-if="false">
      <a href="#" @click.prevent="editProject()">Fork this Game</a>
    </div>
    <Loading v-if="loading"/>
  </div>
  <div v-if="crazyGames" class="crazygames-logo">
    <img src="/crazygames/Variant_Light.svg">
  </div>
  <div v-if="crazyGamesUser" class="crazygames-user">
    <img :src="crazyGamesUser.profilePictureUrl">
    <span>{{crazyGamesUser.username}}</span>
  </div>
  <div
    id="crazygames-banner"
    v-show="crazyGamesShowBanner"
    :style="{
      width: crazyGamesShowBannerSize.width,
      height: crazyGamesShowBannerSize.height,
    }"
    />
</template>

<script lang="ts">

// https://discoverthreejs.com/tips-and-tricks/

declare const window: any;

import { Raw, markRaw, resolveDirective } from 'vue'
import { Vue, Component, Prop, Ref, Emit, Watch } from 'vue-facing-decorator';
import { ResizeSensor } from 'css-element-queries';
import Stats from "stats.js"

import { DiscordSDK } from "@discord/embedded-app-sdk";
import { createGesture } from '@ionic/vue';
import { SafeArea } from 'capacitor-plugin-safe-area'
import { StatusBar, Style } from '@capacitor/status-bar';
import Loading from './Loading.vue'

import * as VIO from './core/VioCore';
window.VIO = VIO
for (let [key,val] of Object.entries(VIO))
  if (key.startsWith('Vio'))
    window[key] = val

let THREE = VIO.THREE
window.THREE = THREE

import * as Nebula from 'three-nebula';
window.Nebula = Nebula

import SwipeListener from 'swipe-listener';
import { Scene } from 'three';
import { VioComponent } from './core/VioCore';
window.SwipeListener = SwipeListener

const { fetch: originalFetch } = window;

window.fetch = async (...args:any[]) => {
    let [url, opt] = args;
    let req = null
    if (typeof url == 'object') {
      req = url
      url = req.url
    }
    let prefix = 'https://app.cinevva.com/'
    if (url.startsWith(prefix) && !url.endsWith('/login'))
      url = `./${url.slice(prefix.length)}`
    if (url.startsWith('/'))
      url = `.${url}`
    if (req) {
      req = new Request(url, req)
    }
    let res = await originalFetch(url, opt)
    if (res.headers.get('content-type') == 'application/json') {
      let json = await res.json()
      let loop = (x:any) => {
        if (Array.isArray(x))
          for (let y of x)
            loop(y)
        else if (x !== null && typeof x == 'object') {
          for (let [k,y] of Object.entries(x)) {
            if (typeof y === 'string' && y.startsWith(prefix))
              x[k] = `./${y.slice(prefix.length)}`
            else
              loop(y)
          }
        }
      }
      loop(json)
      let type = 'application/json'
      let blob = new Blob([JSON.stringify(json)], {type})
      let dataURL = await new Promise<string>(resolve => {
        let reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob) 
      })
      res = await originalFetch(dataURL)
    }
    return res;
};

@Component({
  components: {Loading}
})
export default class App extends Vue {
  loading = true;
  project: any = null
  clock = markRaw(new THREE.Clock())
  stats = markRaw(new Stats())
  scene: Raw<VIO.VioScene>|null = null
  camera: Raw<VIO.VioCamera>|null = null
  sensor: Raw<ResizeSensor>|null = null
  size = {width:0, height:0}
  user:any = null
  delta = 0
  items = []
  extensions = {}
  effects: Record<string, any> = {}
  activeEffects: Array<string> = []
  devicePixelRatio = Math.min(2,Math.max(1,window.devicePixelRatio))
  audioListener: THREE.AudioListener|null = null

  discord = false
  discordSdk: DiscordSDK|null = null
  discordUser: any|null = null
  discordChannelData: any = {}
  discordParticipants: Array<any> = []

  crazyGames = false
  crazyGamesSdk: any|null = null
  crazyGamesUser: any|null = null
  crazyGamesEnvironment: string|null = null
  crazyGamesShowBanner = false
  crazyGamesGameDriving = false
  crazyGamesGameCrashing = null
  // 728x90
  // 300x250
  // 320x50
  // 468x60
  // 320x100
  crazyGamesShowBannerSize = {width:728, height:90}

  @Ref readonly viewport!: HTMLDivElement

  editProject() {
    this.discordSdk!.commands.openExternalLink({url: `https://app.cinevva.com/edit/${this.project.uuid}`})
  }

  async getDesktopParticipants() {
    let {participants} = await this.discordSdk!.commands.getInstanceConnectedParticipants()
    this.discordParticipants = participants
  }

  async getDiscordChannelData() {
    let data = await fetch(`/discord/storage/${this.discordSdk!.channelId}`).then(res => res.json())
    this.discordChannelData = data
    return data
  }

  async setDiscordChannelData(data:any) {
    data = await fetch(`/discord/storage/${this.discordSdk!.channelId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: {'content-type': 'application/json'}
    }).then(res => res.json())
    this.discordChannelData = data
    return data
  }

  async publishDiscordGameStats() {
    let game = this.scene?.objects?.find(object => object.meta.name == 'rider')?.getComponent('kqves38yebp')
    let data = await this.getDiscordChannelData()
    let newScore = (game as any)?.score
    let oldScore = data[this.discordUser.id]?.score
    if (newScore !== undefined && (oldScore == undefined || newScore > oldScore)) {
      let patch = {} as any
      patch[this.discordUser.id] = {
        score: newScore,
        user: this.discordUser.global_name,
      }
      this.setDiscordChannelData(patch)
    }
  }

  get leaderboard():Array<any> {
    try {
      let entries = [] as Array<any>
      for (let id of Object.keys(this.discordChannelData)) {
        entries.push({
          id,
          user: this.discordChannelData[id].user,
          score: this.discordChannelData[id].score,
          online: this.discordParticipants.some(user => user?.id == id),
        })
      }
      entries.sort((a:any,b:any) => a.score - b.score)
      let leaderboard = entries.slice(0,10)
      if (this.discordUser) {
        let me = entries.find(entry => entry.id == this.discordUser.id)
        if (me && !leaderboard.includes(me))
          leaderboard.push(me)
      }
      return leaderboard
    }
    catch (ex) {
      console.error('failef to compute leaderboard', ex)
      return []
    }
  }

  async setupDiscord() {
    let params = new URLSearchParams(window.location.search)
    let client_id = '1235058086985863238'
    console.log('waiting for discord')
    this.discordSdk = new DiscordSDK(client_id);
    await this.discordSdk.ready()
    window.discordSdk = this.discordSdk
    await this.discordSdk.commands.encourageHardwareAcceleration()
    let {access_token, refresh_token} = localStorage
    if (access_token) {
      let response = await this.discordSdk.commands.authenticate({access_token})
      if (response.access_token) {
        access_token = access_token
        this.discordUser = response.user
      }
      else
        access_token = null
    }
    if (!access_token) {
      let {code} = await this.discordSdk.commands.authorize({
        client_id: '1235058086985863238',
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'email'],
      })
      let response = await fetch('/discord/token', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code})
      }).then(res => res.json())
      access_token = response.access_token
      refresh_token = response.refresh_token
      localStorage.access_token = access_token
      localStorage.refresh_token = refresh_token
      response = await this.discordSdk.commands.authenticate({access_token})
      this.discordUser = response.user
    }
    setInterval(this.getDiscordChannelData, 1000)
    setInterval(this.getDesktopParticipants, 1000)
    setInterval(this.publishDiscordGameStats, 1000)
  }

  async setupCrazyGames() {
    await new Promise((resolve, reject) => {
      let script = document.createElement('script')
      script.setAttribute('src', 'https://sdk.crazygames.com/crazygames-sdk-v3.js')
      script.addEventListener('load', resolve)
      script.addEventListener('error', reject)
      document.head.appendChild(script)
    })
    this.crazyGamesSdk = markRaw((window as any).CrazyGames.SDK)
    await this.crazyGamesSdk.init()
    this.crazyGamesEnvironment = this.crazyGamesSdk.environment
    this.crazyGamesSdk.user.getUser().then((user:any) => this.crazyGamesUser = user)
    setInterval(() => {
      this.crazyGamesGameDriving = window?.game?.driving
      this.crazyGamesGameCrashing = window?.game?.crashing
    }, 100)
    this.crazyGamesShowBanner = true
    await this.$nextTick()
    await window.CrazyGames.SDK.banner.requestBanner({
      id: "crazygames-banner",
      width: this.crazyGamesShowBannerSize.width,
      height: this.crazyGamesShowBannerSize.height,
    })
  }

  @Watch('crazyGamesGameCrashing') async onCrazyGamesGameCrashing(crazyGamesGameCrashing:any) {
    if (crazyGamesGameCrashing) {
      setTimeout(() => {
        if (this.crazyGamesGameCrashing == crazyGamesGameCrashing)
          this.crazyGamesSdk.ad.requestAd("midgame", {
            adStarted: () => {
              window.game?.crashMusic?.pause()
            },
            adFinished: () => {
              window.game?.crashMusic?.play()
            },
            adError: (error:string) => console.log("Error midgame ad", error),
          })
      }, 5000)
    }
  }

  @Watch('crazyGamesGameDriving') async onCrazyGamesGameDriving(newState:any, oldState:any) {
    if (newState)
    this.crazyGamesSdk.game.gameplayStart();
    else
    this.crazyGamesSdk.game.gameplayStop();
  }

  setupSafeArea(insets:any) {
    for (const [key, value] of Object.entries(insets)) {
      document.documentElement.style.setProperty(
        `--safe-area-inset-${key}`,
        `${value}px`)
    }
  }
  async mounted() {
    let params = new URLSearchParams(window.location.search)
    SafeArea.getSafeAreaInsets().then(({insets}:any) => this.setupSafeArea(insets))
    SafeArea.addListener('safeAreaChanged', ({insets}:any) => this.setupSafeArea(insets))
    StatusBar.setStyle({ style: Style.Dark }).catch(ex => console.log(ex.message))
    StatusBar.hide().catch(ex => console.log(ex.message))

    if (window.location.hostname.endsWith('.discordsays.com')) {
      this.discord = true
      this.setupDiscord()
    }

    if (params.get('crazygames') || window.location.hostname.endsWith('.crazygames.com')) {
      this.crazyGames = true
      await this.setupCrazyGames()
    }

    createGesture({
      el: VIO.VioHud.instance.element,
      threshold: 2,
      maxAngle: 180,
      gestureName: 'swipe',
      // onStart: ev => console.log('onStart', ev),
      // onMove: ev => console.log('onMove', ev),
      // onEnd: ev => console.log('onEnd', ev)
    }).enable()

    window.app = this
    this.stats.dom.classList.add('stats')
    // this.viewport.appendChild(this.stats.dom)
    VIO.VioComponentRegistry.init()
    VIO.VioHudElementsRegistry.init()
    this.sensor = markRaw(new ResizeSensor(this.viewport, ({width, height}) => {
      VIO.VioHud.instance.anchor = {x:this.viewport.offsetLeft, y:this.viewport.offsetTop}
      VIO.VioHud.instance.size = this.size = {width, height}
      VIO.VioRender.resize(width, height, this.devicePixelRatio);
      VIO.VioRender.render()
    }));
    VIO.VioRender.renderer.debug.checkShaderErrors = false
    VIO.VioRender.rootScene.matrixWorldAutoUpdate = false
    VIO.VioRender.composer.setPixelRatio(this.devicePixelRatio)
    this.viewport.appendChild(VIO.VioRender.canvasElement)
    this.viewport.appendChild(VIO.VioHud.instance.element)
    this.project = await this.loadProject(params.get('project') ?? 'mzb4xt0m1ts')
    try {
      this.crazyGamesSdk?.game?.loadingStart()
      console.log('start loading scene')
      await this.loadScene(this.project!.load)
      console.log('finish loading scene')
      this.crazyGamesSdk?.game?.loadingStop()
    }
    catch (ex) {
      console.warn('failed to load scene', ex)
    }
    finally {
      this.loading = false
    }
  }

  unmounted() {
    this.sensor!.detach()
  }

  loadAsset(uuid:string) {
    return fetch(`https://app.cinevva.com/api/assets/${uuid}.json`).then(res => {
      return res.status == 200 ? res.json() : null
    })
  }

  loadProject(uuid:string) {
    return fetch(`https://app.cinevva.com/api/projects/${uuid}.json`).then(res => {
      return res.status == 200 ? res.json() : null
    })
  }

  async loadScene(url:string) {
    let data = await (await fetch(url)).json()
    let extensions = data.extensions || {}
    let activeEffects = {} as any;
    for (let object of data.objects) {
      await this.preloadComponents(object);
    }
    this.audioListener = markRaw(new THREE.AudioListener())
    await VIO.VioScene.load(url,
      (progress:number, status:string) => {
        console.log({progress, status})
      },
      () => {},
      (scene) => {
        VIO.VioRender.scene = scene
        this.scene = markRaw(scene)
      })
    VIO.VioHud.instance.size = this.size

    for (let uuid of data.activeEffects ?? []) {
      activeEffects[uuid] = data.effects[uuid] ?? {}
    }

    if (data.camera?.initial) {
      let position = new THREE.Vector3().copy(data.camera.initial.position);
      let rotation = new THREE.Euler().set(
        data.camera.initial.rotation.x,
        data.camera.initial.rotation.y,
        data.camera.initial.rotation.z,
        data.camera.initial.rotation.order ?? 'YXZ');
      VIO.VioRender.camera.userData.initial = {position, rotation};
    }
    this.scene = markRaw(VIO.VioRender.scene)
    this.camera = markRaw(VIO.VioRender.camera)
    this.camera.add(this.audioListener)

    for (let uuid of Object.keys(activeEffects))
      await this.loadEffect(uuid);

    for (let uuid of Object.keys(activeEffects))
      await this.activateEffect(uuid, activeEffects[uuid]);

    for (let object of this.scene.objects) {
      if (object.meta?.position) {
        object.position.set(
          object.meta.position.x,
          object.meta.position.y,
          object.meta.position.z)
      }
      if (object.meta?.rotation) {
        object.rotation.set(
          object.meta.rotation.x,
          object.meta.rotation.y,
          object.meta.rotation.z,
          object.meta.rotation.order)
      }
    }

    if (this.camera.userData.initial) {
      let {position, rotation} = this.camera.userData.initial
      this.camera.position.set(
        position.x,
        position.y,
        position.z)
      this.camera.rotation.set(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.order)
    }

    this.scene.updateMatrixWorld(true)

    VIO.VioRender.renderer.compile(this.scene, this.camera.selectedCamera, VIO.VioRender.rootScene)

    VIO.VioEvents.broadcastEvent('sceneStart')
    requestAnimationFrame(this.renderFrame)
  }

  renderFrame() {
    this.stats.begin()
    let delta = this.clock.getDelta()
    if (delta > 1/10)
      delta = 1/10
    VIO.VioRender.instance.render2(delta)
    this.stats.end()
    requestAnimationFrame(this.renderFrame)
  }

  async loadEffect(uuid:string, asset:any=null, extension:any=null) {
    if (!asset)
      asset = await this.loadAsset(uuid);
    if (asset && !extension)
      extension = await fetch(asset.load).then(res => res.json())
    if (asset && extension) {
      this.registerEffect(uuid, extension)
    }
  }

  async activateEffect(uuid:string, props:any = {}) {
    let i = this.activeEffects.indexOf(uuid);
    if (this.effects[uuid] && i == -1) {
      if (!this.effects[uuid].effect) {
        this.effects[uuid].effect = markRaw(new this.effects[uuid].Effect());
      }
      for (let key of Object.keys(props)) {
        this.effects[uuid].effect.slots[key] = props[key];
      }
      await this.effects[uuid].effect.init();
      this.activeEffects.push(uuid);
      for (let object of this.scene!.objects) {
        for (let component of object.components as Array<any>) {
          if (component.extension?.deps?.some((dep:any) => dep.uuid == uuid)) {
            if (!component.active && component.depsSatisified) {
              if (component.funcs.init)
                component.funcs.init()
              component.active = true
            }
          }
        }
      }
    }
  }

  registerEffect(uuid:string, extension:any) {
    class Effect {
      active: boolean = false;
      inited: boolean = false;
      slots: any;
      funcs: any;
      extension: any;
      constructor() {
        this.extension = extension;
        this.slots = {}
        for (let slot of extension.slots || []) {
          this.slots[slot.code] = slot.default;
        }
        let funcs = Object.assign({}, extension.funcs)
        funcs.init = funcs.init ?? 'void(0)'
        funcs.term = funcs.term ?? 'void(0)'
        this.funcs = {}
        for (let name of Object.keys(funcs)) {
          let code = extension.funcs[name];
          if (code?.trim()) {
            try {
              this.funcs[name] = eval(`
                ${name == 'init' ? 'async' : ''} () => {
                  try {
                    ${code}
                  }
                  catch (ex) {
                    console.error(ex)
                  }
                  finally {
                    ${name == 'init' ? 'this.inited = true' : ''}
                    ${name == 'term' ? 'this.inited = false' : ''}
                  }
                }
              `)
            }
            catch (ex) {
              console.error(ex)
            }
          }
        }
      }
      async init() {
        if (this.funcs.init)
          await this.funcs.init();
        this.active = true;
      }
      term() {
        this.active = false;
        if (this.funcs.term)
          this.funcs.term();
      }
      tune() {
        if (this.active && this.inited) {
          if (this.funcs.tune)
            this.funcs.tune();
        }
      }
      tick(delta:number) {
        if (this.active && this.inited) {
          if (this.funcs.tick)
            this.funcs.tick(delta);
        }
      }
      step() {
        if (this.active && this.inited) {
          if (this.funcs.step)
            this.funcs.step();
        }
      }
    }
    let effect = null;
    this.effects[uuid] = {
      Effect,
      effect,
    };
  }

  async preloadComponents(data:any) {
    for (let component of data?.components ?? [])
      await this.preloadComponent(component.name)
    for (let object of data?.objects ?? [])
      await this.preloadComponents(object)
  }

  async preloadComponent(name:string) {
    if (!VIO.VioComponentRegistry.hasComponent(name)) {
      let asset = await this.loadAsset(name)
      if (asset) {
        let extension = await fetch(asset.load).then(res => res.json())
        this.registerComponent(name, extension)
      }
    }
  }

  registerComponent(uuid:string, extension:any) {
    VIO.ExtensionComponent.registerExtension(uuid, extension)
  }

}
</script>
<style lang="scss">
html {
  font-family: Helvetica, Sans-Serif;
}
html, body, #app, .viewport {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  overflow: hidden;
  background: black;
}
#app {
  display: flex;
  flex-direction: column;
}
.viewport .stats {
  & > canvas {
    display: block!important;
  }
  top: 0;
  top: var(--safe-area-inset-top); 
}
.cinevva {
  position: absolute;
  top: 0;
  top: var(--safe-area-inset-top); 
  right: 0;
  color: white;
  font-family: Intro;
  z-index: 1;
  padding: 20px;
  font-size: 1.2em;
  a {
    color: inherit;
    font-size: inherit;
    font-family: inherit;
  }
}
.discord {
  z-index: 1;
  position: absolute;
  top: 0;
  top: var(--safe-area-inset-top); 
  left: 0;
  color: white;
  font-family: Intro;
  padding: 20px;
  .leaderboard {
    label {
      font-size: 1.2em;
    }
    ul {
      list-style: none;
      margin: 10px 30px;
      padding: 0;
      li:nth-child(1):before {
        content: "🏆";
        position: absolute;
        margin-top: -2px;
        margin-left: -20px;
      }
      li:nth-child(2):before {
        content: "#2";
        margin-left: -20px;
      }
      li:nth-child(3):before {
        content: "#3";
        margin-left: -20px;
      }
    }
  }
}
#crazygames-banner {
  width: var(--banner-width);
  height: var(--banner-height);
}
#banner-crazygames-inner {
  margin: auto;
}
.crazygames-user {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: white;
  font-family: Intro;
  align-items: center;
  img {
    width: 60px;
    height: 60px;
    border-radius: 10px;
  }
}
.crazygames-logo {
  position: absolute;
  top: 20px;
  right: 20px;
}
</style>