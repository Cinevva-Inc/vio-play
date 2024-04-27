<template>
  <div class="viewport" ref="viewport" id="viewport"/>
  <div style="position:absolute;top:0;left:0;z-index: 1;">
    <div id="signin-google"></div>
  </div>
</template>

<script lang="ts">

// https://discoverthreejs.com/tips-and-tricks/

declare const window: any;

import { Raw, markRaw } from 'vue'
import { Vue, Component, Prop, Ref, Emit, Watch } from 'vue-facing-decorator';
import { ResizeSensor } from 'css-element-queries';
import Stats from "stats.js"


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
      url = `./pack/${url.slice(prefix.length)}`
    if (url.startsWith('/'))
      url = `.${url}`
    if (req) {
      req = new Request(url, req)
    }
    let res = await originalFetch(url, opt)
    return res;
};

@Component({
  components: {}
})
export default class App extends Vue {
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

  @Ref readonly viewport!: HTMLDivElement

  async mounted() {
    window.app = this
    this.stats.dom.classList.add('stats')
    // this.viewport.appendChild(this.stats.dom)
    VIO.VioComponentRegistry.init()
    VIO.VioHudElementsRegistry.init()
    this.sensor = markRaw(new ResizeSensor(this.viewport, ({width, height}) => {
      console.log('resize', width, height)
      VIO.VioHud.instance.size = this.size = {width, height}
      VIO.VioRender.resize(width, height, this.devicePixelRatio);
      VIO.VioRender.render()
    }));
    VIO.VioRender.renderer.debug.checkShaderErrors = false
    VIO.VioRender.rootScene.matrixWorldAutoUpdate = false
    VIO.VioRender.composer.setPixelRatio(this.devicePixelRatio)
    this.viewport.appendChild(VIO.VioRender.canvasElement)
    this.viewport.appendChild(VIO.VioHud.instance.element)
    this.project = await this.loadProject('mzb4xt0m1ts')
    try {
      console.log('start loading scene')
      await this.loadScene(this.project!.load)
      console.log('finish loading scene')
    }
    catch (ex) {
      console.warn('failed to load scene', ex)
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
html, body, #app, .viewport {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  overflow: hidden;
}
.viewport .stats {
  & > canvas {
    display: block!important;
  }
}
</style>