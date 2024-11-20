import * as THREE from './node_modules/three/src/Three.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import * as CANNON from 'cannon-es';


// Core variables
let container, camera, scene, renderer;
let controller, reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let blockTexture = null;
let startButton;

let gameStarted = false;
let lastCollapseCheckTime = 0;
let basePosition;
let isReady = false;
let canMove = false;
// Emit readiness to the server


let physicsEnabled = false;
const blockMaterial = new CANNON.Material({ friction: 10.0, restitution: 0.0 });

// Connect to the WebSocket server
// Connect to the WebSocket server
const socket = io('https://arjengaupdated1.vercel.app/api/socket');
function notifyReady() {
  socket.emit('player-ready');
}
// Handle connection
socket.on('connect', () => {
  console.log('Connected to the server with ID:', socket.id);
});

// Handle game start
socket.on('start-game', (initialGameState) => {
  console.log('Game started with initial state:', initialGameState);
  gameStarted = true;
  startButton.visible = false;
  reticle.visible = false;

  // Sync the initial game state

});
let res = false;
socket.on('game-result', ({ message }) => {
  if (!res)
    alert(message); // Display the result to the player
  res = true;
  console.log(message); // Log the result for debugging purposes
});

// Listen for block updates from the server
socket.on('update-block', (relativeChange) => {
  if (!basePosition) {
    console.warn("Base position not set. Unable to apply block updates.");
    return;
  }

  const blockIndex = relativeChange.id;

  // Calculate the new position
  const newPosition = {
    x: basePosition.x + relativeChange.relativePosition.x,
    y: basePosition.y + relativeChange.relativePosition.y,
    z: basePosition.z + relativeChange.relativePosition.z,
  };

  // Update the block
  if (blockIndex >= 0 && blockIndex < cubes.length) {
    const blockBody = cubeBodies[blockIndex];
    blockBody.position.set(newPosition.x, newPosition.y, newPosition.z);
    blockBody.quaternion.set(
      relativeChange.quaternion.x,
      relativeChange.quaternion.y,
      relativeChange.quaternion.z,
      relativeChange.quaternion.w
    );

    cubes[blockIndex].position.copy(blockBody.position);
    cubes[blockIndex].quaternion.copy(blockBody.quaternion);
  } else {
    console.warn(`Block with ID ${blockIndex} does not exist.`);
  }
});

socket.on('turn-update', ({ currentTurn }) => {
  if (socket.id === currentTurn) {
    // Allow the current player to move
    canMove = true;
    if (!res)
      alert('Your turn!');
  } else {
    // Disable movement for non-current players
    canMove = false;
    if (!res)
      alert('Waiting for the other player...');
  }
  if (res == true) {
    canMove = true;
  }
});

const cubes = [];
const cubeBodies = [];
const cubeHeight = 0.05; // Height of the cuboid
const spacing = 0.001; // Minimal spacing between layers
const baseWidth = 0.1; // Base width of the cuboid
const baseDepth = 3 * baseWidth + spacing; // Base depth of the cuboid
const levels = 10; // Number of levels
const clock = new THREE.Clock();
let light;
let selectedBlock = null;
let selectedBlockInitialQuaternion = null; // To store the block's orientation


const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0), // Gravity pulling objects down
});
world.solver.iterations = 50; // Increase iterations for more stable results
world.solver.tolerance = 0.01; // Set higher tolerance for a forgiving simulation


// Objects in the scene
let model, modelBody;
let groundMesh, groundBody;



// Notify server of block movement
function notifyBlockMovement(blockBody, blockIndex) {
  const blockData = {
    id: blockIndex,
    position: {
      x: blockBody.position.x,
      y: blockBody.position.y,
      z: blockBody.position.z,
    },
    quaternion: {
      x: blockBody.quaternion.x,
      y: blockBody.quaternion.y,
      z: blockBody.quaternion.z,
      w: blockBody.quaternion.w,
    },
  };

  socket.emit('update-block', blockData);
}


document.addEventListener('DOMContentLoaded', () => {
  const startButton1 = document.getElementById('start-game');

  startButton1.addEventListener('click',
    () => {

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
        context.fillText('Ready?', canvas.width / 2, canvas.height / 2);

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
        // Create a directional light that casts shadows


        // Enable shadow rendering in the renderer


        // Renderer setup
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.xr.enabled = true;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows for better quality
        container.appendChild(renderer.domElement);
        light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0.5, 1, 0.25); // Position the light
        light.castShadow = true; // Enable shadow casting

        // Configure shadow properties for better quality
        light.shadow.mapSize.width = 1024; // Shadow map resolution
        light.shadow.mapSize.height = 1024;
        light.shadow.camera.near = 0.5; // Near clipping plane
        light.shadow.camera.far = 500; // Far clipping plane

        // Optional: Adjust the shadow camera bounds (useful for directional lights)
        light.shadow.camera.left = -10;
        light.shadow.camera.right = 10;
        light.shadow.camera.top = 10;
        light.shadow.camera.bottom = -10;

        // Add the light to the scene
        scene.add(light);
        // Add AR button for WebXR
        const arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
        arButton.style.position = 'fixed';
        arButton.style.bottom = '10px';
        arButton.style.left = '50%';
        arButton.style.transform = 'translateX(-50%)';
        document.body.appendChild(arButton);
        

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
        groundMesh.receiveShadow = true;
        groundMesh.visible = false;
        scene.add(groundMesh);
        const groundPhysicsMaterial = new CANNON.Material({ friction: 10.0, restitution: 0.0 });

        // Create the ground body in Cannon.js
        const groundShape = new CANNON.Box(new CANNON.Vec3(groundSize / 2, 0.01, groundSize / 2));
        groundBody = new CANNON.Body({
          mass: 0, // Static body
          shape: groundShape,
          material: groundPhysicsMaterial,
        });
        groundBody.receiveShadow = true;
        world.addBody(groundBody);

        // Create materials for blocks and ground

        // Add contact material between block and ground
        world.addContactMaterial(
          new CANNON.ContactMaterial(blockMaterial, groundPhysicsMaterial, {
            friction: 10.0, // High friction
            restitution: 0.0, // No bounce
          })
        );

        // Add contact material for block-to-block interactions
        world.addContactMaterial(
          new CANNON.ContactMaterial(blockMaterial, blockMaterial, {
            friction: 10.0, // High friction between blocks
            restitution: 0.0, // No bounce
          })
        );

        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('assets/wood.jpg', () => {
          blockTexture = textureLoader.load('assets/wood.jpg', () => { });
          console.log('Texture loaded successfully');
        }, undefined, (error) => {
          console.error('Error loading texture:', error);
        });




        // Set up the controller for interaction
        controller = renderer.xr.getController(0);
        controller.addEventListener('select', onSelect);
        scene.add(controller);

        // Handle window resize
        window.addEventListener('resize', onWindowResize);


        window.addEventListener('keydown', onKeyDown);
        // Add event listeners for both pointer and touch inputs
        window.addEventListener('pointerdown', onInteractionStart);
        window.addEventListener('pointermove', onInteractionMove);
        window.addEventListener('pointerup', onInteractionEnd);

        // Touch-specific listeners for mobile devices
        window.addEventListener('touchstart', onInteractionStart);
        window.addEventListener('touchmove', onInteractionMove);
        window.addEventListener('touchend', onInteractionEnd);

      }

      function isTowerCollapsed() {
        // Thresholds for collapse detection
        const displacementThreshold = 0.3; // Maximum distance a block can move before being considered "out of place"
        const rotationThreshold = 0.3; // Maximum quaternion deviation (angular threshold)

        let collapsedCount = 0;

        // Iterate through all blocks
        for (let i = 0; i < cubes.length; i++) {
          const cube = cubes[i];
          const cubeBody = cubeBodies[i];

          // Original position and rotation
          const originalPosition = cubeBody.initPosition; // Assume you saved this during initialization
          const originalQuaternion = cubeBody.initQuaternion; // Assume you saved this during initialization

          // Calculate displacement
          const displacement = cubeBody.position.vsub(originalPosition).length();

          // Convert Cannon.js quaternion to THREE.js quaternion
          const currentQuaternion = new THREE.Quaternion(
            cubeBody.quaternion.x,
            cubeBody.quaternion.y,
            cubeBody.quaternion.z,
            cubeBody.quaternion.w
          );

          // Calculate rotation difference (quaternion dot product gives cosine of half the angle)
          const rotationDifference = Math.abs(currentQuaternion.dot(originalQuaternion) - 1);

          // Check if block is out of place
          if (displacement > displacementThreshold || rotationDifference > rotationThreshold) {
            collapsedCount++;
          }
        }

        // If a significant number of blocks are out of place, consider the tower collapsed
        const collapseRatio = collapsedCount / cubes.length;
        return collapseRatio > 0.3; // Adjust this value to control sensitivity
      }


      function initializeTowerState() {
        for (let i = 0; i < cubeBodies.length; i++) {
          cubeBodies[i].initPosition = cubeBodies[i].position.clone(); // Store initial position
          cubeBodies[i].initQuaternion = cubeBodies[i].quaternion.clone(); // Store initial orientation
        }
      }
      function checkTowerState() {
        if (isTowerCollapsed()) {
          // Notify the server that the tower has collapsed with the player's ID
          socket.emit('tower-collapsed', {
            playerId: socket.id,
            message: 'The tower has collapsed!',
          });

          console.log("Tower has collapsed");
        }
      }

      function enablePhysicsTemporarily(duration = 1000) {
        // Enable physics
        physicsEnabled = true;
        console.log('Physics enabled.');

        // Set a timeout to disable physics after the specified duration
        setTimeout(() => {
          physicsEnabled = false;
          console.log('Physics disabled.');
        }, duration);
      }
      function highlightBlock(block) {
        if (block) {
          if (!block.material.__originalColor) {
            // Store the original color only once
            block.material.__originalColor = block.material.color.clone();
          }
          block.material.color.set(0xffff33); // Highlight with green color
          block.material.needsUpdate = true;
        }
      }

      function resetHighlight(block) {
        if (block && block.material.__originalColor) {
          // Restore the original color
          block.material.color.copy(block.material.__originalColor);
          block.material.needsUpdate = true;
        }
      }




      // Keydown event to move the block
      function onKeyDown(event) {
        if (!selectedBlock || !gameStarted || !canMove) return;

        const blockPosition = selectedBlock.position;
        const movementStep = 0.01;

        switch (event.key.toLowerCase()) {
          case 'w': blockPosition.y += movementStep; break;
          case 's': blockPosition.y -= movementStep; break;
          case 'a': blockPosition.x -= movementStep; break;
          case 'd': blockPosition.x += movementStep; break;
          case 'r':
            selectedBlock.mass = 1;
            selectedBlock.fixedRotation = false;
            selectedBlock.updateMassProperties();
            const index = cubeBodies.indexOf(selectedBlock);
            if (index >= 0) {
              cubes[index].position.copy(blockPosition);
              notifyBlockMovement(selectedBlock, index);
              resetHighlight(cubes[index]);
            }
            selectedBlock = null;
            return;
          default: break;
        }

        // Sync block with physics body

      }
      let isTouching = false; // Track if the user is interacting
      let touchStart = null; // Track the initial pointer or touch position

      // Unified event for pointer or touch start
      function onInteractionStart(event) {
        console.log("start");
        if (!gameStarted || !canMove) return;

        // Handle both touch and pointer events
        const pointer = new THREE.Vector2();
        if (event.touches) {
          // Touch event
          const touch = event.touches[0];
          pointer.set(
            (touch.clientX / window.innerWidth) * 2 - 1,
            -(touch.clientY / window.innerHeight) * 2 + 1
          );
        } else {
          // Pointer event
          pointer.set(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
          );
        }

        // Raycast to detect objects
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(cubes);

        if (intersects.length > 0) {
          const intersectedMesh = intersects[0].object;
          const index = cubes.indexOf(intersectedMesh);

          if (index >= 0) {
            const newSelectedBlock = cubeBodies[index];

            if (newSelectedBlock) {
              // Highlight the block
              selectedBlock = newSelectedBlock;
              highlightBlock(intersectedMesh);

              // Prepare the block for movement
              selectedBlockInitialQuaternion = selectedBlock.quaternion.clone();
              selectedBlock.mass = 0; // Disable physics
              selectedBlock.fixedRotation = true; // Lock rotation
              selectedBlock.updateMassProperties();

              // Track the touch start
              touchStart = pointer.clone();
              isTouching = true;
            }
          }
        }
      }

      // Unified event for pointer or touch move
      function onInteractionMove(event) {
        console.log("Move");

        if (!isTouching || !selectedBlock || !canMove) return;

        // Handle both touch and pointer events
        const pointer = new THREE.Vector2();
        if (event.touches) {
          // Touch event
          const touch = event.touches[0];
          pointer.set(
            (touch.clientX / window.innerWidth) * 2 - 1,
            -(touch.clientY / window.innerHeight) * 2 + 1
          );
        } else {
          // Pointer event
          pointer.set(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
          );
        }

        if (touchStart) {
          // Calculate movement delta
          const delta = new THREE.Vector2(
            pointer.x - touchStart.x,
            pointer.y - touchStart.y
          );

          // Translate the block based on delta
          selectedBlock.position.x += delta.x * 0.5; // Adjust sensitivity
          selectedBlock.position.z += delta.y * 0.5; // Adjust sensitivity

          // Update touchStart for the next move
          touchStart = pointer.clone();

          // Sync the mesh with the body
          const index = cubeBodies.indexOf(selectedBlock);
          if (index >= 0) {
            cubes[index].position.copy(selectedBlock.position);
          }
        }
      }

      // Unified event for pointer or touch end
      function onInteractionEnd() {
        console.log("end");

        if (!isTouching || !selectedBlock || !canMove) return;

        // Release the block back into physics
        selectedBlock.mass = 1;
        selectedBlock.fixedRotation = false;
        selectedBlock.updateMassProperties();

        // Ensure the block maintains its orientation when released
        if (selectedBlockInitialQuaternion) {
          selectedBlock.quaternion.copy(selectedBlockInitialQuaternion);
          const index = cubeBodies.indexOf(selectedBlock);
          if (index >= 0) cubes[index].quaternion.copy(selectedBlockInitialQuaternion);
        }

        // Reset highlight and clear selection

        const index = cubeBodies.indexOf(selectedBlock);
        if (index >= 0) {
          notifyBlockMovement(selectedBlock, index);
          resetHighlight(cubes[index]);
        }

        selectedBlock = null;
        selectedBlockInitialQuaternion = null;

        isTouching = false;
        touchStart = null;
      }


      function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }


      function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      async function createLayersAtPosition(basePosition) {
        physicsEnabled = false; // Temporarily disable physics updates during creation

        for (let level = 0; level < levels; level++) {
          const cubeWidth = level % 2 === 0 ? baseWidth : baseDepth; // Alternate width
          const cubeDepth = level % 2 === 0 ? baseDepth : baseWidth; // Alternate depth
          const baseMass = 1; // Base mass for the bottom layer
          const mass = baseMass * (1 - level / levels); // Reduce mass as the layers go higher
          physicsEnabled = false; // Temporarily disable physics updates during creation

          for (let i = 0; i < 3; i++) {
            let x = basePosition.x + (i - 1) * (cubeWidth + spacing); // Horizontal positioning
            const y = basePosition.y + cubeHeight / 2 + level * cubeHeight; // Vertical positioning
            let z = basePosition.z;

            if (level % 2 === 1) {
              // Alternate alignment for odd layers
              x = basePosition.x;
              z = basePosition.z + (i - 1) * (cubeDepth + spacing);
            }

            // Create Three.js Mesh
            console.log("Vls", blockTexture);
            const blockMaterial2 = new THREE.MeshStandardMaterial({
              map: blockTexture || null, // Use blockTexture if available, otherwise no texture
              color: blockTexture ? null : 0xB78319, // Fallback to blue if blockTexture is undefined
            });
            const cubeMesh = new THREE.Mesh(
              new THREE.BoxGeometry(cubeWidth, cubeHeight, cubeDepth),
              blockMaterial2.clone()
            );
            cubeMesh.position.set(x, y, z);

            // Enable shadows for the cube
            cubeMesh.castShadow = true;

            scene.add(cubeMesh);
            cubes.push(cubeMesh);
            cubeMesh.visible = true;

            // Create Cannon.js Body
            const cubeBody = new CANNON.Body({
              mass: Math.max(mass, 0.1), // Ensure a minimum mass
              shape: new CANNON.Box(new CANNON.Vec3(cubeWidth / 2, cubeHeight / 2, cubeDepth / 2)),
              position: new CANNON.Vec3(x, y, z),
              material: blockMaterial,
              linearDamping: 0.2, // Increase damping for more stability
              angularDamping: 0.2,
            });
            console.log(x, y, z);
            world.addBody(cubeBody);
            cubeBodies.push(cubeBody);

            console.log(`Cube created at position: (${x}, ${y}, ${z})`);
          }

          // Wait briefly before adding the next layer to ensure proper placement
          physicsEnabled = true;
          await new Promise((resolve) => setTimeout(resolve, 500)); // Shorter delay for smoother stacking
        }

        // Re-enable physics after creation
        physicsEnabled = false;
      }



      function placeTowerAtReticle(position) {
        // Clear the previous tower and related objects
        clearPreviousTower();

        // Build the Jenga tower at the new position
        createLayersAtPosition(position);

        console.log('Tower placed at:', position);
        socket.emit('set-base-position', {
          x: position.x,
          y: position.y,
          z: position.z,
        });
        basePosition = position;
      }

      function clearPreviousTower() {
        // Remove old cubes from the scene and world
        while (cubes.length > 0) {
          const cube = cubes.pop();
          scene.remove(cube); // Remove from scene
        }

        while (cubeBodies.length > 0) {
          const body = cubeBodies.pop();
          world.removeBody(body); // Remove from physics world
        }

        // Clear any selected block references
        selectedBlock = null;
        selectedBlockInitialQuaternion = null;

        console.log('Previous objects cleared.');
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
            isReady = true;
            physicsEnabled = true;
            console.log('Game Started!');
            notifyReady();
            return;
          }
          if (reticle.visible) {
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            reticle.matrix.decompose(position, rotation, scale);

            // Place the ground at the reticle position
            groundMesh.position.copy(position);
            groundMesh.visible = true;
            groundBody.position.set(position.x, position.y - 0.01, position.z);
            groundBody.receiveShadow = true;

            light.position.set(position.x, position.y + 5, position.z + 5);


            // Build the Jenga tower at the reticle position
            placeTowerAtReticle(position);
            initializeTowerState();
          }
        }
      }

      function updateSelectedBlock() {
        // Ensure selectedBlock and selectedBlockInitialQuaternion are defined
        if (!selectedBlock || !selectedBlockInitialQuaternion) return;

        // Check if selectedBlock is a valid physics body in cubeBodies
        const index = cubeBodies.indexOf(selectedBlock);
        if (index === -1) return;

        // Maintain the initial orientation of the selected block
        selectedBlock.quaternion.copy(selectedBlockInitialQuaternion);
        cubes[index].quaternion.copy(selectedBlock.quaternion);

        // Sync the mesh position with the body position
        cubes[index].position.copy(selectedBlock.position);
      }


      function animate(timestamp, frame) {
        // Step the physics world if enabled
        if (physicsEnabled) {
          const delta = clock.getDelta();
          world.step(1 / 60, delta); // Fixed time step for physics
          lastCollapseCheckTime += delta;
          if (lastCollapseCheckTime >= 1) {
            lastCollapseCheckTime = 0;
            checkTowerState();
          }
        }


        // Sync Three.js meshes with Cannon.js bodies
        for (let i = 0; i < cubes.length; i++) {
          cubes[i].position.copy(cubeBodies[i].position);
          cubes[i].quaternion.copy(cubeBodies[i].quaternion);
        }

        // Update start button position and orientation if the game hasn't started
        if (startButton && !gameStarted) {
          const cameraPosition = new THREE.Vector3();
          camera.getWorldPosition(cameraPosition);

          const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

          const buttonPosition = cameraPosition.clone().add(cameraDirection.multiplyScalar(1.5));
          buttonPosition.y += 0.7; // Slightly above camera height

          startButton.position.copy(buttonPosition);
          startButton.lookAt(cameraPosition); // Face the camera
        }

        // Sync the model with its physics body
        if (model && modelBody) {
          model.position.copy(modelBody.position);
          model.quaternion.copy(modelBody.quaternion);

          // Optional: Lock model orientation (e.g., 90 degrees rotation)
          const fixedRotation = new THREE.Quaternion();
          fixedRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
          model.quaternion.copy(fixedRotation);
        }

        // Maintain block orientation if a block is selected
        updateSelectedBlock();

        // Sync the ground mesh with its physics body
        if (groundMesh && groundBody) {
          groundMesh.position.copy(groundBody.position);
        }

        // AR hit-testing logic
        if (frame) {
          handleHitTest(frame);
        }

        // Render the scene
        renderer.render(scene, camera);
      }

      // AR hit-testing logic extracted into a separate function
      function handleHitTest(frame) {
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

            if (gameStarted) {
              reticle.visible = false;
            } else {
              reticle.visible = true;
              reticle.matrix.fromArray(hitPose.transform.matrix);
            }
          } else {
            reticle.visible = false;
          }
        }
      }

      // Initialize the animation loop only once
      renderer.setAnimationLoop(animate);
    });
});