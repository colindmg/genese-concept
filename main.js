import gsap from "gsap";
import GUI from "lil-gui";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { HoloEffect } from "./HoloEffect";

/**
 * Base
 */
// Debug
const gui = new GUI();

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

// Loaders
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

/**
 * Models
 */
let model;
gltfLoader.load("/models/human.glb", (gltf) => {
  model = gltf.scene.children[0];

  const material = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    roughness: 0.28,
    metalness: 1,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };

    shader.fragmentShader =
      `
      uniform float uTime;

      mat4 rotationMatrix(vec3 axis, float angle) {
      axis = normalize(axis);
      float s = sin(angle);
      float c = cos(angle);
      float oc = 1.0 - c;
      
      return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                  oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                  oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                  0.0,                                0.0,                                0.0,                                1.0);
      }

      vec3 rotate(vec3 v, vec3 axis, float angle) {
        mat4 m = rotationMatrix(axis, angle);
        return (m * vec4(v, 1.0)).xyz;
      }
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      `#include <envmap_physical_pars_fragment>`,
      `
      #ifdef USE_ENVMAP
        vec3 getIBLIrradiance( const in vec3 normal ) {
          #ifdef ENVMAP_TYPE_CUBE_UV
            vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
            vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
            return PI * envMapColor.rgb * envMapIntensity;
          #else
            return vec3( 0.0 );
          #endif
        }

        vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
          #ifdef ENVMAP_TYPE_CUBE_UV
            vec3 reflectVec = reflect( - viewDir, normal );
            reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
            reflectVec = inverseTransformDirection( reflectVec, viewMatrix );

            reflectVec = rotate(reflectVec, vec3(1.0, 0.0, 0.0), uTime * 0.3);

            vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
            return envMapColor.rgb * envMapIntensity;
          #else
            return vec3( 0.0 );
          #endif
        }

        #ifdef USE_ANISOTROPY
          vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
            #ifdef ENVMAP_TYPE_CUBE_UV
              vec3 bentNormal = cross( bitangent, viewDir );
              bentNormal = normalize( cross( bentNormal, bitangent ) );
              bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
              return getIBLRadiance( viewDir, bentNormal, roughness );
            #else
              return vec3( 0.0 );
            #endif
          }
        #endif
      #endif
      `
    );

    material.userData.shader = shader;
  };

  // Changement de la matière du modèle
  model.traverse((child) => {
    if (child.isMesh) {
      child.material = material;
    }
  });

  // Repositionnement du modèle
  model.position.y = -0.8;
  model.position.z = 0.05;
  model.rotateY(Math.PI / 2);

  // Add the model to the scene
  scene.add(model);
});

// AXES HELPER TEMP
// const axesHelper = new THREE.AxesHelper(5);
// scene.add(axesHelper);

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xffffff, 2.4);
scene.add(ambientLight);

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.01,
  10
);
// camera.position.set(-2, 0, 0);
camera.position.set(0.01, 0.89, 0.05);
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;

renderer.setClearColor(0x050505);

gui.add(renderer, "toneMappingExposure", 0, 3, 0.001).name("Exposure");

/**
 * Postprocessing
 */
const renderPass = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizes.width, sizes.height),
  1.5,
  0.4,
  0.85
);
bloomPass.threshold = 0.1;
bloomPass.strength = 1.5;
bloomPass.radius = 0.4;

gui.add(bloomPass, "threshold", 0, 1, 0.001).name("BloomThreshold");
gui.add(bloomPass, "strength", 0, 3, 0.001).name("BloomStrength");
gui.add(bloomPass, "radius", 0, 1, 0.001).name("BloomRadius");

const holoEffect = new ShaderPass(HoloEffect);

const afterimagePass = new AfterimagePass();
// afterimagePass.uniforms["damp"].value = 0.5;
gui
  .add(afterimagePass.uniforms["damp"], "value", 0, 1)
  .step(0.001)
  .name("AfterimageDamp");

const effectComposer = new EffectComposer(renderer);
effectComposer.addPass(renderPass);
effectComposer.addPass(bloomPass);
effectComposer.addPass(holoEffect);
effectComposer.addPass(afterimagePass);

/**
 * Environment
 */
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

const envMap = textureLoader.load("/environment/env.jpg", (texture) => {
  const envMap = pmremGenerator.fromEquirectangular(texture).texture;
  scene.environment = envMap;
  pmremGenerator.dispose();
});

/**
 * Animate
 */
const clock = new THREE.Clock();
const tick = () => {
  const elapsedTime = clock.getElapsedTime();

  // Update model
  if (model) {
    model.rotation.y = elapsedTime / 2;

    model.traverse((child) => {
      if (child.isMesh && child.material.userData.shader) {
        child.material.userData.shader.uniforms.uTime.value = elapsedTime;
      }
    });

    holoEffect.uniforms.uTime.value = elapsedTime;
  }

  // Update controls
  controls.update();

  // Render
  // renderer.render(scene, camera);

  // Render with postprocessing
  effectComposer.render();

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();

// -------------------------------

gui.hide();

// Sélection du bouton
const animateButton = document.getElementById("animateCamera");

// Animation de la caméra vers la position (-2.5, 0, 0) lors du clic
animateButton.addEventListener("click", () => {
  const tl = gsap.timeline();

  // tl.to(camera.position, {
  //   y: 0.9,
  //   duration: 0.1,
  //   ease: "power1.in",
  // });
  tl.to(camera.position, {
    x: -2.5,
    y: 0,
    z: 0,
    duration: 2,
    ease: "power2.inOut",
  });
});
