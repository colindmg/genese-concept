import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import GUI from "lil-gui";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { HoloEffect } from "./HoloEffect";
gsap.registerPlugin(ScrollTrigger);

// SCROLL TO TOP ON REFRESH
window.onbeforeunload = function () {
  window.scrollTo(0, 0);
};

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

  // ANIMATION DU MODEL AU SCROLL - exécute l'animation ici
  gsap.to(model.position, {
    y: 2,
    ease: "none",
    scrollTrigger: {
      trigger: canvas,
      start: "top top",
      end: "bottom top",
      scrub: 1,
    },
  });
});

// AXES HELPER TEMP
// const axesHelper = new THREE.AxesHelper(5);
// scene.add(axesHelper);

/**
 * Particles
 */
const particleTexture = textureLoader.load("/textures/star.png");

// Geometry
const particlesGeometry = new THREE.BufferGeometry();
const count = 150;

const positions = new Float32Array(count * 3);
const colors = new Float32Array(count * 3);

for (let i = 0; i < count * 3; i++) {
  positions[i] = (Math.random() - 0.5) * 15;

  // Faire en sorte que les couleurs soit toujours entre 0.9 et 1
  colors[i] = Math.random() * 0.1 + 0.9;
}

particlesGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(positions, 3)
);

particlesGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

// Material
const particlesMaterial = new THREE.PointsMaterial({
  size: 0.05,
  sizeAttenuation: true,
  alphaMap: particleTexture,
  transparent: true,
  // alphaTest: 0.001,
  // depthTest: false,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
});

// Points
const particles = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particles);

gsap.to(particles.position, {
  y: -1,
  ease: "power1.inOut",
  scrollTrigger: {
    trigger: canvas,
    start: "top top",
    end: "bottom top",
    scrub: 1,
  },
});

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
camera.lookAt(new THREE.Vector3(0, 0, 0));
scene.add(camera);

// Controls
// const controls = new OrbitControls(camera, canvas);
// controls.enableDamping = true;

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
// Variables to store mouse position and camera target position
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;

let mouseMoveActived = false;

// Add event listener for mouse movement
window.addEventListener("mousemove", (event) => {
  // Calculate mouse position in normalized device coordinates (-1 to +1)
  mouseX = (event.clientX / sizes.width) * 2 - 1;
  mouseY = -(event.clientY / sizes.height) * 2 + 1;

  // Amplify the movement effect
  targetX = mouseX * 0.1;
  targetY = mouseY * 0.1;
});

const clock = new THREE.Clock();
const tick = () => {
  const elapsedTime = clock.getElapsedTime();

  if (mouseMoveActived) {
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetX, 0.025);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.025);
  }

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
  // controls.update();

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
  // ÉLÉMENTS DE LA PREMIÈRE VUE
  gsap.to(camera.position, {
    x: -2.5,
    y: 0,
    z: 0,
    duration: 2,
    ease: "power2.inOut",
    onUpdate: () => {
      camera.lookAt(new THREE.Vector3(0, 0, 0));
    },
    onComplete: () => {
      mouseMoveActived = true;
      document.body.style.overflowY = "auto";
    },
  });

  gsap.to(model.position, {
    z: 0,
    duration: 2,
    ease: "power2.inOut",
  });

  gsap.to("#blackLogo", {
    opacity: 0,
    duration: 1,
    delay: 0.3,
    ease: "power2.inOut",
    onComplete: () => {
      document.getElementById("blackLogo").style.display = "none";
    },
  });

  gsap.to("#animateCamera", {
    opacity: 0,
    duration: 0.5,
    ease: "power2.inOut",
    onComplete: () => {
      document.getElementById("animateCamera").style.display = "none";
    },
  });

  // ÉLÉMENTS DE LA DEUXIÈME VUE
  gsap.to("#whiteLogo", {
    opacity: 1,
    filter: "blur(0px)",
    duration: 1,
    delay: 1.25,
    ease: "power2.inOut",
  });

  gsap.to("#planet", {
    opacity: 1,
    duration: 1.5,
    delay: 1.75,
    ease: "power2.inOut",
  });

  gsap.to("#links a", {
    opacity: 1,
    filter: "blur(0px)",
    duration: 0.5,
    delay: 1.5,
    ease: "power2.inOut",
    stagger: 0.1,
  });

  gsap.to("#infos p", {
    opacity: 1,
    filter: "blur(0px)",
    duration: 0.5,
    delay: 1.5,
    ease: "power2.inOut",
    stagger: 0.1,
  });
});

gsap.to("#overlay", {
  opacity: 0,
  duration: 1,
  delay: 1,
  ease: "power2.inOut",
});

// APPARITION DE LA PAGE PRODUITS AU SCROLL

const animateProductsPage = () => {
  gsap.to("#overlay-products h2", {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    duration: 0.8,
    ease: "power2.inOut",
  });

  gsap.to("#overlay-products .product", {
    opacity: 1,
    duration: 1,
    delay: 0.5,
    ease: "power2.inOut",
    stagger: 0.1,
  });
};

let appearAnimate = false;
gsap.to("#overlay-products", {
  opacity: 1,
  ease: "power1.out",
  scrollTrigger: {
    trigger: canvas,
    start: "top top",
    end: "bottom top",
    scrub: 1,
    onUpdate: (self) => {
      // Vérifie le progrès du scroll
      if (self.progress > 0.8 && !appearAnimate) {
        appearAnimate = true;
        animateProductsPage();
      }
    },
  },
});
