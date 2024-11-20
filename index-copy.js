import * as THREE from './node_modules/three/src/Three.js';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

//Main

let container;
let camera, scene, renderer;
let controller, reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let model;

// Initialize the scene, renderer, camera, and AR button
init();
animate();

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // Add AR Button
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // GLTFLoader to load the model
    const loader = new GLTFLoader().setPath('assets/');
    loader.load('jenga.glb', (gltf) => {
        model = gltf.scene;

        // Use bounding box to determine the size of the model
        const boundingBox = new THREE.Box3().setFromObject(model);
        const size = boundingBox.getSize(new THREE.Vector3());

        // Log the size for debugging purposes
        console.log('Model Size:', size);

        // Adjust this scale factor based on the model size
        let scaleFactor = 0.01;

        // Apply the scale based on the size of the model
        model.scale.set(scaleFactor, scaleFactor, scaleFactor);

        // Hide the model until it is placed
        model.visible = false;
        scene.add(model);
    });


    // Reticle to indicate where the model can be placed
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Event listener for selecting and placing the model
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // Handle window resizing
    window.addEventListener('resize', onWindowResize);
}

// Function to handle window resizing
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Function to handle the selection event (tapping the screen)
function onSelect() {
    if (reticle.visible && model) {
        reticle.matrix.decompose(model.position, model.quaternion, model.scale);
        model.position.x-=0.3 //To place it correctly in reticle
        console.log(model.position);
        model.visible = true;
    }
}

// Animation loop
function animate(timestamp, frame) {
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

                // Make the reticle visible and position it at the hit test result
                reticle.visible = true;
                reticle.matrix.fromArray(hitPose.transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }

    renderer.render(scene, camera);
    renderer.setAnimationLoop(animate);
}