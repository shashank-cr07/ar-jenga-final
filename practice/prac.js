import * as THREE from './node_modules/three/src/Three.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';

// Core variables
let container, camera, scene, renderer;
let controller, reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

let startButton;
let gameStarted = false;


const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0), // Gravity pulling objects down
});
const timeStep = 1 / 60;

// Objects in the scene
let model, modelBody;
let groundMesh, groundBody;

init();
animate();
function createStartButton() {
  // Create a floating panel for the button
  const geometry = new THREE.PlaneGeometry(0.4, 0.15);
  const material = new THREE.MeshBasicMaterial({
    color: 0x44cc44,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });

  startButton = new THREE.Mesh(geometry, material);

  // Add text to the button
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 128;

  // Style the text
  context.fillStyle = '#000000';
  context.font = 'bold 48px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('Start Game', canvas.width / 2, canvas.height / 2);

  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  const textGeometry = new THREE.PlaneGeometry(0.35, 0.12);
  const textMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });

  const textMesh = new THREE.Mesh(textGeometry, textMaterial);
  textMesh.position.z = 0.001; // Slightly in front of the button
  startButton.add(textMesh);

  // Position the button in space
  startButton.position.set(0, 0.5, -1); // Adjust these values as needed
  startButton.lookAt(camera.position);

  // Add button to scene
  scene.add(startButton);
}



function init() {
  // Create the container
  container = document.createElement('div');
  document.body.appendChild(container);

  // Create the scene
  scene = new THREE.Scene();

  // Set up camera
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  // Add light to the scene
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  // Add AR button for WebXR
  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));


  createStartButton();


  // Reticle for hit-testing
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.15, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Set up the ground plane (visual and physics)
  const groundSize = 1.5;
  const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
  const groundMaterial = new THREE.MeshBasicMaterial({
    color: 0x008800,
    side: THREE.DoubleSide,
  });
  groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.visible = false;
  scene.add(groundMesh);

  // Create the ground body in Cannon.js
  const groundShape = new CANNON.Box(new CANNON.Vec3(groundSize / 2, 0.01, groundSize / 2));
  groundBody = new CANNON.Body({
    mass: 0, // Static body
    shape: groundShape,
  });
  world.addBody(groundBody);

  // Load the Jenga model using GLTFLoader
  const loader = new GLTFLoader().setPath('assets/');
  loader.load('jenga.glb', (gltf) => {
    model = gltf.scene;

    // Calculate bounding box to determine the size of the physics body
    const boundingBox = new THREE.Box3().setFromObject(model);
    const size = boundingBox.getSize(new THREE.Vector3());
    const scaleFactor = 1; // Adjust to match your preference
    model.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Initially hide the model until it is placed
    model.visible = false;
    scene.add(model);

    // Set up the model's physics body
    const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)); // Half extents
    modelBody = new CANNON.Body({
      mass: 1, // Dynamic body
      position: new CANNON.Vec3(0, 0, 0), // Initial position
      shape: shape,
      material: new CANNON.Material({ restitution: 0.1 }), // Slight bounce for realism
    });

    // Add damping to make the motion more stable
    modelBody.linearDamping = 0.3;
    modelBody.angularDamping = 0.4;

    // Add the model's physics body to the world
    world.addBody(modelBody);
  });

  // Set up the controller for interaction
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Handle window resize
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onSelect() {
  if (!gameStarted) {
    const raycaster = new THREE.Raycaster();
    const tempMatrix = new THREE.Matrix4();

    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const intersects = raycaster.intersectObject(startButton, true);

    if (intersects.length > 0) {
      gameStarted = true;
      startButton.visible = false;
      reticle.visible = false;
      console.log('Game Started!');
      return;
    }
    if (reticle.visible && model) {
      // Place the ground at the reticle's position
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      reticle.matrix.decompose(position, rotation, scale);

      groundMesh.position.copy(position);
      groundMesh.visible = true;

      groundBody.position.set(position.x, position.y - 0.01, position.z);

      // Drop the model slightly above the ground
      model.position.set(position.x - 0.1, position.y + 1, position.z + 0.5);
      model.quaternion.copy(rotation);
      model.visible = true;

      modelBody.position.set(position.x - 0.1, position.y + 1, position.z + 0.5);
      modelBody.velocity.set(0, 0, 0); // Reset velocity to prevent continuous motion
    }
  }
}

function animate(timestamp, frame) {
  // Step the physics world
  world.step(timeStep);

  // Sync the model mesh with its physics body
  if (model && modelBody) {
    model.position.copy(modelBody.position);
    model.quaternion.copy(modelBody.quaternion);
    // Set 90-degree rotation on the square mesh
    const quaternion1 = new THREE.Quaternion();
    quaternion1.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); // 90 degrees in radians
    model.quaternion.copy(quaternion1);

  }

  // Sync the ground mesh with its physics body
  if (groundMesh && groundBody) {
    groundMesh.position.copy(groundBody.position);
  }

  // AR hit-testing
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then((viewerSpace) => {
        session.requestHitTestSource({ space: viewerSpace }).then((source) => {
          hitTestSource = source;
        });
      });

      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });

      hitTestSourceRequested = true;
    }

    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length) {
        const hit = hitTestResults[0];
        const hitPose = hit.getPose(referenceSpace);

        // Update reticle position and make it visible
        if (gameStarted) {
          reticle.visible = false;
        }
        else {
          reticle.visible = true;
        }
        reticle.matrix.fromArray(hitPose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
  }

  // Render the scene
  renderer.render(scene, camera);

  // Continue the animation loop
  renderer.setAnimationLoop(animate);
}