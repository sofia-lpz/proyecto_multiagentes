import * as twgl from 'twgl.js';
import GUI from 'lil-gui';

// Define the vertex shader code, using GLSL 3.00
import vsGLSL from "./assets/vs_phong.glsl?raw";
// Import the fragment shader code, using GLSL 3.00
import fsGLSL from "./assets/fs_phong.glsl?raw";

// Define the Object3D class to represent 3D objects
let lastFrameTime = performance.now();
let lastUpdateTime = performance.now();
const INTERPOLATION_INTERVAL = 1000; // 1 second between updates

// Modify the Object3D class to include interpolation properties
class Object3D {
  constructor(id, position=[0,0,0], rotation=[0,0,0], scale=[1,1,1]){
    this.id = id;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.matrix = twgl.m4.create();
    
    // Add these properties for interpolation
    this.previousPosition = [...position];
    this.targetPosition = [...position];
    this.interpolationFactor = 1.0;
  }
}


//obstacles

const OBSTACLES_PER_BUFFER = 100;

// Store buffer infos and VAOs for obstacle groups
let obstacleBufferGroups = [];
let obstacleModelData;

// Define the agent server URI
const agent_server_uri = "http://localhost:8585/";

// Initialize arrays to store agents and obstacles
const agents = [];
const obstacles = [];

// Initialize WebGL-related variables
let gl, programInfo, agentArrays, obstacleArrays, agentsBufferInfo, obstaclesBufferInfo, agentsVao, obstaclesVao;

// Define the camera position
let cameraPosition = {x:0, y:0, z:0};

// Initialize the frame count
let frameCount = 0;

// Define the data object
const data = {
  NAgents: 500,
  width: 100,
  height: 100
};

let cameraTarget = {x:data.width/2, y:0, z:data.height/2};

// Main function to initialize and run the application
let agentModelData;

async function main() {
    const canvas = document.querySelector('canvas');
    gl = canvas.getContext('webgl2');

    // Create the program information using the vertex and fragment shaders
    programInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);

    // Load both agent and obstacle models
    try {
        // Load the agent model
        agentModelData = await loadModelData(
            '/assets/models/Car.obj',
            '/assets/models/Car.mtl',
            0.3
        );
        
        // Load the obstacle (building) model
        await loadObstacleModel();
    } catch (error) {
        console.error('Failed to load models:', error);
        // Fallback to basic shapes if loading fails
        agentModelData = generateData(1);
        obstacleModelData = generateObstacleData(1);
    }

    // Create agent buffer info
    agentsBufferInfo = twgl.createBufferInfoFromArrays(gl, agentModelData);
    agentsVao = twgl.createVAOFromBufferInfo(gl, programInfo, agentsBufferInfo);

    // Set up the user interface
    setupUI();

    // Initialize the agents model
    await initAgentsModel();

    // Get the agents and obstacles
    await getAgents();
    await getObstacles();

    // Draw the scene
    await drawScene(gl, programInfo, agentsVao, agentsBufferInfo);
}

// Update the drawScene function to use the new drawObstacles

/*
 * Initializes the agents model by sending a POST request to the agent server.
 */
async function initAgentsModel() {
  try {
    // Send a POST request to the agent server to initialize the model
    let response = await fetch(agent_server_uri + "init", {
      method: 'POST', 
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(data)
    })

    // Check if the response was successful
    if(response.ok){
      // Parse the response as JSON and log the message
      let result = await response.json()
      console.log(result.message)
    }
      
  } catch (error) {
    // Log any errors that occur during the request
    console.log(error)    
  }
}

/*
 * Retrieves the current positions of all agents from the agent server.
 */
async function getAgents() {
    try {
        let response = await fetch(agent_server_uri + "getAgents");

        if (response.ok) {
            let result = await response.json();
            
            const currentAgentsMap = new Map(
                result.positions.map(agent => [agent.id, agent])
            );

            // Remove agents that no longer exist
            for (let i = agents.length - 1; i >= 0; i--) {
                if (!currentAgentsMap.has(agents[i].id)) {
                    agents.splice(i, 1);
                }
            }

            // Update existing agents and add new ones
            result.positions.forEach(agentData => {
                const rotation = getRotationFromDirection(agentData.direction);
                const existingAgentIndex = agents.findIndex(a => a.id === agentData.id);

                if (existingAgentIndex !== -1) {
                    // Update existing agent
                    const agent = agents[existingAgentIndex];
                    // Store current position as previous position
                    agent.previousPosition = [...agent.position];
                    // Set new target position
                    agent.targetPosition = [agentData.x, agentData.y, agentData.z || 0];
                    // Reset interpolation factor
                    agent.interpolationFactor = 0;
                    agent.rotation = [0, rotation, 0];
                } else {
                    // Add new agent
                    const newAgent = new Object3D(
                        agentData.id,
                        [agentData.x, agentData.y, agentData.z || 0],
                        [0, rotation, 0],
                        [1, 1, 1]
                    );
                    // Initialize interpolation properties
                    newAgent.previousPosition = [...newAgent.position];
                    newAgent.targetPosition = [...newAgent.position];
                    newAgent.interpolationFactor = 1.0;
                    agents.push(newAgent);
                }
            });
        }
    } catch (error) {
        console.error("Error fetching agents:", error);
    }
}
/*
 * Retrieves the current positions of all obstacles from the agent server.
 */
async function getObstacles() {
    try {
        let response = await fetch(agent_server_uri + "getObstacles");

        if (response.ok) {
            let result = await response.json();
            
            // Clear existing obstacles and buffer groups
            obstacles.length = 0;
            
            // Clean up existing buffer groups
            obstacleBufferGroups.forEach(group => {
                if (group.bufferInfo) {
                    // Delete existing buffers
                    Object.values(group.bufferInfo.attribs).forEach(attrib => {
                        gl.deleteBuffer(attrib.buffer);
                    });
                    if (group.bufferInfo.indices) {
                        gl.deleteBuffer(group.bufferInfo.indices);
                    }
                }
                if (group.vao) {
                    gl.deleteVertexArray(group.vao);
                }
            });
            obstacleBufferGroups.length = 0;

            // Create new obstacles
            for (const obstacle of result.positions) {
                const newObstacle = new Object3D(
                    obstacle.id, 
                    [obstacle.x, obstacle.y, obstacle.z || 0],
                    [Math.PI / 2, Math.random() * Math.PI * 2, 0],
                    [.5, 1 + Math.random() * 0.3, .5]
                );
                obstacles.push(newObstacle);
            }

            // Group obstacles into smaller batches
            for (let i = 0; i < obstacles.length; i += OBSTACLES_PER_BUFFER) {
                const groupObstacles = obstacles.slice(i, i + OBSTACLES_PER_BUFFER);
                
                try {
                    // Create new buffer info for this group
                    const bufferInfo = twgl.createBufferInfoFromArrays(gl, obstacleModelData);
                    if (!bufferInfo) {
                        console.error('Failed to create buffer info for obstacle group', i);
                        continue;
                    }

                    // Create VAO for this group
                    const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);
                    if (!vao) {
                        console.error('Failed to create VAO for obstacle group', i);
                        continue;
                    }

                    // Add the new buffer group
                    obstacleBufferGroups.push({
                        obstacles: groupObstacles,
                        bufferInfo,
                        vao
                    });
                } catch (error) {
                    console.error('Error creating buffer group:', error);
                }
            }

            console.log(`Created ${obstacleBufferGroups.length} buffer groups for ${obstacles.length} obstacles`);
        }
    } catch (error) {
        console.error('Error in getObstacles:', error);
    }
}
async function loadObstacleModel() {
    try {
        obstacleModelData = await loadModelData(
            '/assets/models/tallbuild.obj',
            '/assets/models/tallbuild.mtl',
            0.5  // Scale factor for the building
        );
        console.log("Successfully loaded building model");
    } catch (error) {
        console.error('Failed to load building model:', error);
        // Fallback to basic cube if model loading fails
        obstacleModelData = generateObstacleData(1);
    }
}

/*
 * Updates the agent positions by sending a request to the agent server.
 */
async function update() {
  try {
    // Send a request to the agent server to update the agent positions
    let response = await fetch(agent_server_uri + "update") 

    // Check if the response was successful
    if(response.ok){
      // Retrieve the updated agent positions
      await getAgents()
      // Log a message indicating that the agents have been updated
      console.log("Updated agents")
    }

  } catch (error) {
    // Log any errors that occur during the request
    console.log(error) 
  }
}

/*
 * Draws the scene by rendering the agents and obstacles.
 * 
 * @param {WebGLRenderingContext} gl - The WebGL rendering context.
 * @param {Object} programInfo - The program information.
 * @param {WebGLVertexArrayObject} agentsVao - The vertex array object for agents.
 * @param {Object} agentsBufferInfo - The buffer information for agents.
 * @param {WebGLVertexArrayObject} obstaclesVao - The vertex array object for obstacles.
 * @param {Object} obstaclesBufferInfo - The buffer information for obstacles.
 */
async function drawScene(gl, programInfo, agentsVao, agentsBufferInfo) {
    // Calculate deltaTime
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
    lastFrameTime = currentTime;
  
    // Update interpolation for all agents
    agents.forEach(agent => {
        agent.interpolationFactor = Math.min(agent.interpolationFactor + deltaTime, 1.0);
        
        // Interpolate position
        for (let i = 0; i < 3; i++) {
            agent.position[i] = agent.previousPosition[i] + 
                (agent.targetPosition[i] - agent.previousPosition[i]) * agent.interpolationFactor;
        }
    });
  
    // Check if it's time for an update
    if (currentTime - lastUpdateTime >= INTERPOLATION_INTERVAL) {
        lastUpdateTime = currentTime;
        await update();
        await getTrafficLights();
    }
  
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  
    gl.clearColor(0.2, 0.2, 0.2, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
    gl.useProgram(programInfo.program);
  
    // Create the view projection matrix
    const viewProjectionMatrix = setupWorldView(gl);
    
    // Add lighting uniforms
    const uniforms = {
        u_viewWorldPosition: [cameraPosition.x + data.width/2, cameraPosition.y, cameraPosition.z + data.height/2],
        u_lightWorldPosition: [20, 30, 50],
        u_ambientLight: [0.2, 0.2, 0.2, 1.0],
        u_diffuseLight: [0.8, 0.8, 0.8, 1.0],
        u_specularLight: [1.0, 1.0, 1.0, 1.0]
    };
    
    twgl.setUniforms(programInfo, uniforms);
  
    drawMapObjects(gl, programInfo, mapObjects, viewProjectionMatrix);
    drawAgents(1, agentsVao, agentsBufferInfo, viewProjectionMatrix);    
    drawObstacles(viewProjectionMatrix); // Updated to only pass viewProjectionMatrix

    requestAnimationFrame(() => drawScene(gl, programInfo, agentsVao, agentsBufferInfo));
}

//helper function
// Helper function to convert direction string to rotation angle in radians
function getRotationFromDirection(direction) {
    switch(direction) {
        case 'Up':
            return 0;  // 0 degrees - facing forward
        case 'Down':
            return Math.PI;  // 180 degrees - facing backward
        case 'Left':
            return Math.PI / 2;  // 90 degrees - facing left
        case 'Right':
            return -Math.PI / 2;  // -90 degrees - facing right
        default:
            return 0;
    }
}

/*
 * Draws the agents.
 * 
 * @param {Number} distance - The distance for rendering.
 * @param {WebGLVertexArrayObject} agentsVao - The vertex array object for agents.
 * @param {Object} agentsBufferInfo - The buffer information for agents.
 * @param {Float32Array} viewProjectionMatrix - The view-projection matrix.
 */
function drawAgents(distance, agentsVao, agentsBufferInfo, viewProjectionMatrix) {
    gl.bindVertexArray(agentsVao);

    for(const agent of agents) {
        const worldMatrix = twgl.m4.identity();
        const cube_trans = twgl.v3.create(...agent.position);
        const cube_scale = twgl.v3.create(
            agent.scale[0] * distance,
            agent.scale[1] * distance,
            agent.scale[2] * distance
        );

        // Apply transformations in the correct order:
        // 1. First translate to position
        twgl.m4.translate(worldMatrix, cube_trans, worldMatrix);
        
        // 2. Apply rotations in the correct order:
        // First rotate 90 degrees around X to orient the model upright
        twgl.m4.rotateX(worldMatrix, Math.PI / 2, worldMatrix);
        // Then apply the agent's Y rotation for heading direction
        twgl.m4.rotateY(worldMatrix, agent.rotation[1], worldMatrix);
        
        // 3. Finally scale the model
        twgl.m4.scale(worldMatrix, cube_scale, worldMatrix);

        // Calculate matrices needed for Phong shading
        const worldInverseTranspose = twgl.m4.transpose(twgl.m4.inverse(worldMatrix));
        const worldViewProjection = twgl.m4.multiply(viewProjectionMatrix, worldMatrix);

        // Set the uniforms for Phong shading
        const uniforms = {
            u_world: worldMatrix,
            u_worldViewProjection: worldViewProjection,
            u_worldInverseTransform: worldInverseTranspose,
            
            // These might already be set globally, but including here for completeness
            u_viewWorldPosition: [cameraPosition.x + data.width/2, cameraPosition.y, cameraPosition.z + data.height/2],
            u_lightWorldPosition: [20, 30, 50],
            u_ambientLight: [0.2, 0.2, 0.2, 1.0],
            u_diffuseLight: [0.8, 0.8, 0.8, 1.0],
            u_specularLight: [1.0, 1.0, 1.0, 1.0],
            u_emissiveFactor: 0.0  // Set to 0 since agents aren't emissive
        };

        twgl.setUniforms(programInfo, uniforms);
        twgl.drawBufferInfo(gl, agentsBufferInfo);
    }
}

      
/*
 * Draws the obstacles.
 * 
 * @param {Number} distance - The distance for rendering.
 * @param {WebGLVertexArrayObject} obstaclesVao - The vertex array object for obstacles.
 * @param {Object} obstaclesBufferInfo - The buffer information for obstacles.
 * @param {Float32Array} viewProjectionMatrix - The view-projection matrix.
 */
function drawObstacles(viewProjectionMatrix) {
    if (!obstacleBufferGroups || obstacleBufferGroups.length === 0) return;

    // Use a try-catch block for each group to prevent total failure if one group fails
    obstacleBufferGroups.forEach((group, index) => {
        try {
            if (!group || !group.vao || !group.bufferInfo || !group.obstacles) {
                console.warn(`Skipping invalid obstacle group ${index}`);
                return;
            }

            gl.bindVertexArray(group.vao);

            group.obstacles.forEach(obstacle => {
                if (!obstacle || !obstacle.position || !obstacle.rotation || !obstacle.scale) {
                    return; // Skip invalid obstacles
                }

                const worldMatrix = twgl.m4.identity();
                const position = twgl.v3.create(...obstacle.position);
                const scale = twgl.v3.create(...obstacle.scale);

                // Apply transformations
                twgl.m4.translate(worldMatrix, position, worldMatrix);
                twgl.m4.rotateX(worldMatrix, obstacle.rotation[0], worldMatrix);
                twgl.m4.rotateY(worldMatrix, obstacle.rotation[1], worldMatrix);
                twgl.m4.rotateZ(worldMatrix, obstacle.rotation[2], worldMatrix);
                twgl.m4.scale(worldMatrix, scale, worldMatrix);

                // Calculate matrices for Phong shading
                const worldInverseTranspose = twgl.m4.transpose(twgl.m4.inverse(worldMatrix));
                const worldViewProjection = twgl.m4.multiply(viewProjectionMatrix, worldMatrix);

                // Set the uniforms
                const uniforms = {
                    u_world: worldMatrix,
                    u_worldViewProjection: worldViewProjection,
                    u_worldInverseTransform: worldInverseTranspose,
                    u_viewWorldPosition: [cameraPosition.x + data.width/2, cameraPosition.y, cameraPosition.z + data.height/2],
                    u_lightWorldPosition: [20, 30, 50],
                    u_ambientLight: [0.2, 0.2, 0.2, 1.0],
                    u_diffuseLight: [0.8, 0.8, 0.8, 1.0],
                    u_specularLight: [1.0, 1.0, 1.0, 1.0],
                    u_emissiveFactor: 0.0
                };

                twgl.setUniforms(programInfo, uniforms);
                
                // Draw with error handling
                try {
                    twgl.drawBufferInfo(gl, group.bufferInfo);
                } catch (drawError) {
                    console.error('Error drawing obstacle:', drawError);
                }
            });
        } catch (groupError) {
            console.error(`Error processing obstacle group ${index}:`, groupError);
        }
    });

    // Cleanup
    gl.bindVertexArray(null);
}

/*
 * Sets up the world view by creating the view-projection matrix.
 * 
 * @param {WebGLRenderingContext} gl - The WebGL rendering context.
 * @returns {Float32Array} The view-projection matrix.
 */
function setupWorldView(gl) {
  const fov = 45 * Math.PI / 180;
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const projectionMatrix = twgl.m4.perspective(fov, aspect, 1, 200);

  // Use the target from our camera target object
  const target = [cameraTarget.x, cameraTarget.y, cameraTarget.z];
  const up = [0, 1, 0];
  
  // Calculate camera position using our position object
  const camPos = twgl.v3.create(cameraPosition.x + data.width/2, cameraPosition.y, cameraPosition.z + data.height/2);

  const cameraMatrix = twgl.m4.lookAt(camPos, target, up);
  const viewMatrix = twgl.m4.inverse(cameraMatrix);
  const viewProjectionMatrix = twgl.m4.multiply(projectionMatrix, viewMatrix);
  
  return viewProjectionMatrix;
}
/*
 * Sets up the user interface (UI) for the camera position.
 */
function setupUI() {
    const gui = new GUI();
    
    // Camera Position folder
    const posFolder = gui.addFolder('Camera Position:');
    posFolder.add(cameraPosition, 'x', -110, 110)
        .onChange(value => {
            cameraPosition.x = value;
        })
        .setValue(0); // Set initial value
        
    posFolder.add(cameraPosition, 'y', -110, 110)
        .onChange(value => {
            cameraPosition.y = value;
        })
        .setValue(0); // Set initial value
        
    posFolder.add(cameraPosition, 'z', -110, 110)
        .onChange(value => {
            cameraPosition.z = value;
        })
        .setValue(0); // Set initial value
    
    // Camera Target folder
    const targetFolder = gui.addFolder('Camera Target:');
    targetFolder.add(cameraTarget, 'x', -110, 110)
        .onChange(value => {
            cameraTarget.x = value;
        })
        .setValue(-33); // Set initial value
        
    targetFolder.add(cameraTarget, 'y', -110, 110)
        .onChange(value => {
            cameraTarget.y = value;
        })
        .setValue(45); // Set initial value
        
    targetFolder.add(cameraTarget, 'z', -110, 110)
        .onChange(value => {
            cameraTarget.z = value;
        })
        .setValue(-73); // Set initial value
}

function generateData(size) {
  let arrays = {
      a_position: {
          numComponents: 3,
          data: [
              // Front Face
              -0.5, -0.5,  0.5,    0.5, -0.5,  0.5,    0.5,  0.5,  0.5,   -0.5,  0.5,  0.5,
              // Back face
              -0.5, -0.5, -0.5,   -0.5,  0.5, -0.5,    0.5,  0.5, -0.5,    0.5, -0.5, -0.5,
              // Top face
              -0.5,  0.5, -0.5,   -0.5,  0.5,  0.5,    0.5,  0.5,  0.5,    0.5,  0.5, -0.5,
              // Bottom face
              -0.5, -0.5, -0.5,    0.5, -0.5, -0.5,    0.5, -0.5,  0.5,   -0.5, -0.5,  0.5,
              // Right face
               0.5, -0.5, -0.5,    0.5,  0.5, -0.5,    0.5,  0.5,  0.5,    0.5, -0.5,  0.5,
              // Left face
              -0.5, -0.5, -0.5,   -0.5, -0.5,  0.5,   -0.5,  0.5,  0.5,   -0.5,  0.5, -0.5,
          ].map(e => size * e),
      },
      a_normal: {
          numComponents: 3,
          data: [
              // Front face
               0.0,  0.0,  1.0,    0.0,  0.0,  1.0,    0.0,  0.0,  1.0,    0.0,  0.0,  1.0,
              // Back face
               0.0,  0.0, -1.0,    0.0,  0.0, -1.0,    0.0,  0.0, -1.0,    0.0,  0.0, -1.0,
              // Top face
               0.0,  1.0,  0.0,    0.0,  1.0,  0.0,    0.0,  1.0,  0.0,    0.0,  1.0,  0.0,
              // Bottom face
               0.0, -1.0,  0.0,    0.0, -1.0,  0.0,    0.0, -1.0,  0.0,    0.0, -1.0,  0.0,
              // Right face
               1.0,  0.0,  0.0,    1.0,  0.0,  0.0,    1.0,  0.0,  0.0,    1.0,  0.0,  0.0,
              // Left face
              -1.0,  0.0,  0.0,   -1.0,  0.0,  0.0,   -1.0,  0.0,  0.0,   -1.0,  0.0,  0.0,
          ]
      },
      // New attributes for Phong shading
      a_ambientColor: {
          numComponents: 4,
          data: Array(24).fill([0.2, 0.2, 0.2, 1.0]).flat()
      },
      a_diffuseColor: {
          numComponents: 4,
          data: Array(24).fill([0.8, 0.8, 0.8, 1.0]).flat()
      },
      a_specularColor: {
          numComponents: 4,
          data: Array(24).fill([1.0, 1.0, 1.0, 1.0]).flat()
      },
      a_shininess: {
          numComponents: 1,
          data: Array(24).fill(100)
      },
      indices: {
          numComponents: 3,
          data: [
              0,  1,  2,    0,  2,  3,    // Front
              4,  5,  6,    4,  6,  7,    // Back
              8,  9,  10,   8,  10, 11,   // Top
              12, 13, 14,   12, 14, 15,   // Bottom
              16, 17, 18,   16, 18, 19,   // Right
              20, 21, 22,   20, 22, 23    // Left
          ]
      }
  };
  return arrays;
}

function generateObstacleData(size) {
    const positions = [
        // Front face
        -0.5, -0.5,  0.5,
         0.5, -0.5,  0.5,
         0.5,  0.5,  0.5,
        -0.5,  0.5,  0.5,
        // Back face
        -0.5, -0.5, -0.5,
        -0.5,  0.5, -0.5,
         0.5,  0.5, -0.5,
         0.5, -0.5, -0.5,
        // Top face
        -0.5,  0.5, -0.5,
        -0.5,  0.5,  0.5,
         0.5,  0.5,  0.5,
         0.5,  0.5, -0.5,
        // Bottom face
        -0.5, -0.5, -0.5,
         0.5, -0.5, -0.5,
         0.5, -0.5,  0.5,
        -0.5, -0.5,  0.5,
        // Right face
         0.5, -0.5, -0.5,
         0.5,  0.5, -0.5,
         0.5,  0.5,  0.5,
         0.5, -0.5,  0.5,
        // Left face
        -0.5, -0.5, -0.5,
        -0.5, -0.5,  0.5,
        -0.5,  0.5,  0.5,
        -0.5,  0.5, -0.5,
    ].map(coord => coord * size);

    // Generate normals for each vertex
    const normals = [
        // Front face
        0.0,  0.0,  1.0,    0.0,  0.0,  1.0,    0.0,  0.0,  1.0,    0.0,  0.0,  1.0,
        // Back face
        0.0,  0.0, -1.0,    0.0,  0.0, -1.0,    0.0,  0.0, -1.0,    0.0,  0.0, -1.0,
        // Top face
        0.0,  1.0,  0.0,    0.0,  1.0,  0.0,    0.0,  1.0,  0.0,    0.0,  1.0,  0.0,
        // Bottom face
        0.0, -1.0,  0.0,    0.0, -1.0,  0.0,    0.0, -1.0,  0.0,    0.0, -1.0,  0.0,
        // Right face
        1.0,  0.0,  0.0,    1.0,  0.0,  0.0,    1.0,  0.0,  0.0,    1.0,  0.0,  0.0,
        // Left face
        -1.0,  0.0,  0.0,   -1.0,  0.0,  0.0,   -1.0,  0.0,  0.0,   -1.0,  0.0,  0.0,
    ];

    // Generate material properties for each vertex
    const numVertices = positions.length / 3;
    const baseColor = [0.8, 0.8, 0.8, 1.0];
    
    return {
        a_position: {
            numComponents: 3,
            data: positions
        },
        a_normal: {
            numComponents: 3,
            data: normals
        },
        a_ambientColor: {
            numComponents: 4,
            data: Array(numVertices * 4).fill(0).map((_, i) => baseColor[i % 4] * 0.3)
        },
        a_diffuseColor: {
            numComponents: 4,
            data: Array(numVertices * 4).fill(0).map((_, i) => baseColor[i % 4])
        },
        a_specularColor: {
            numComponents: 4,
            data: Array(numVertices * 4).fill(0).map((_, i) => i % 4 === 3 ? 1.0 : 0.8)
        },
        a_shininess: {
            numComponents: 1,
            data: Array(numVertices).fill(100)
        },
        indices: {
            numComponents: 3,
            data: [
                0,  1,  2,    0,  2,  3,    // Front
                4,  5,  6,    4,  6,  7,    // Back
                8,  9,  10,   8,  10, 11,   // Top
                12, 13, 14,   12, 14, 15,   // Bottom
                16, 17, 18,   16, 18, 19,   // Right
                20, 21, 22,   20, 22, 23    // Left
            ]
        }
    };
}

function generateMapFromGrid(gridString) {
  // Split the string into rows and reverse to start from bottom
  const rows = gridString.trim().split('\n').reverse();
  const mapObjects = [];
  
  // Define colors for each symbol
  const symbolColors = {
      '>': [0.5, 0.5, 0.5, 1],     // Blue
      '<': [0.5, 0.5, 0.5, 1],     // Red
      'S': [1, 1, 1, 1] , // Gray for traffic_v
      's': [1, 1, 1, 1] , // Gray for traffic_h
      '#': [0.7, 0.9, 1, 1], // Light blue
      'v':[0.5, 0.5, 0.5, 1],     // Yellow
      '^': [0.5, 0.5, 0.5, 1], // Purple
      'D': [1, 1, 1, 1]      // White
  };

  // Create arrays object for different symbol types
  const mapArrays = {};
  
  for (let y = 0; y < rows.length; y++) {
      const symbols = rows[y].split('');
      for (let x = 0; x < symbols.length; x++) {
          const symbol = symbols[x];
          if (symbol !== ' ') {
              // Create a new object for each symbol
              const mapObject = new Object3D(
                  `map_${x}_${y}`,
                  [x, y, -0.5], // Position with y at -0.3
                  [0, 0, 0],   // No rotation
                  [1, 1, 1]    // Default scale
              );
              
              // Generate the color arrays for this symbol
              const symbolArray = generateColoredData(1, symbolColors[symbol]);
              
              // Store the object with its type and arrays
              mapObjects.push({
                  object: mapObject,
                  type: symbol,
                  arrays: symbolArray
              });
              
              // If symbol is 'S' or 's', add a white sphere
              if (symbol === 'S' || symbol === 's') {
                  const sphereObject = new Object3D(
                      `sphere_${x}_${y}`,
                      [x, y, 0.1], // Position with 0.1 offset from base object
                      [0, 0, 0],
                      [0.3, 0.3, 0.3] // Smaller scale for the sphere
                  );
                  
                  // Generate sphere data with radius 1 and 16 segments
                  const sphereArray = generateSphereData(1, 16);
                  
                  mapObjects.push({
                      object: sphereObject,
                      type: 'sphere',
                      arrays: sphereArray
                  });
              }
          }
      }
  }
  
  return mapObjects;
}

// Modified version of generateData to accept custom colors
function generateColoredData(size, color) {
  return {
      a_position: {
          numComponents: 3,
          data: [
              // Front
              -0.5, -0.5,  0.5,
              0.5, -0.5,  0.5,
              0.5,  0.5,  0.5,
              -0.5,  0.5,  0.5,
              // Back
              -0.5, -0.5, -0.5,
              -0.5,  0.5, -0.5,
              0.5,  0.5, -0.5,
              0.5, -0.5, -0.5,
              // Top
              -0.5,  0.5, -0.5,
              -0.5,  0.5,  0.5,
              0.5,  0.5,  0.5,
              0.5,  0.5, -0.5,
              // Bottom
              -0.5, -0.5, -0.5,
              0.5, -0.5, -0.5,
              0.5, -0.5,  0.5,
              -0.5, -0.5,  0.5,
              // Right
              0.5, -0.5, -0.5,
              0.5,  0.5, -0.5,
              0.5,  0.5,  0.5,
              0.5, -0.5,  0.5,
              // Left
              -0.5, -0.5, -0.5,
              -0.5, -0.5,  0.5,
              -0.5,  0.5,  0.5,
              -0.5,  0.5, -0.5
          ].map(e => size * e),
      },
      a_normal: {
          numComponents: 3,
          data: [
              // Front face
              0.0,  0.0,  1.0,    0.0,  0.0,  1.0,    0.0,  0.0,  1.0,    0.0,  0.0,  1.0,
              // Back face
              0.0,  0.0, -1.0,    0.0,  0.0, -1.0,    0.0,  0.0, -1.0,    0.0,  0.0, -1.0,
              // Top face
              0.0,  1.0,  0.0,    0.0,  1.0,  0.0,    0.0,  1.0,  0.0,    0.0,  1.0,  0.0,
              // Bottom face
              0.0, -1.0,  0.0,    0.0, -1.0,  0.0,    0.0, -1.0,  0.0,    0.0, -1.0,  0.0,
              // Right face
              1.0,  0.0,  0.0,    1.0,  0.0,  0.0,    1.0,  0.0,  0.0,    1.0,  0.0,  0.0,
              // Left face
              -1.0,  0.0,  0.0,   -1.0,  0.0,  0.0,   -1.0,  0.0,  0.0,   -1.0,  0.0,  0.0,
          ]
      },
      // Material properties for Phong shading
      a_ambientColor: {
          numComponents: 4,
          data: Array(24).fill([color[0] * 0.3, color[1] * 0.3, color[2] * 0.3, color[3]]).flat()
      },
      a_diffuseColor: {
          numComponents: 4,
          data: Array(24).fill(color).flat()
      },
      a_specularColor: {
          numComponents: 4,
          data: Array(24).fill([0.8, 0.8, 0.8, 1.0]).flat()
      },
      a_shininess: {
          numComponents: 1,
          data: Array(24).fill(50)
      },
      indices: {
          numComponents: 3,
          data: [
              0,  1,  2,    0,  2,  3,  // Front
              4,  5,  6,    4,  6,  7,  // Back
              8,  9,  10,   8,  10, 11, // Top
              12, 13, 14,   12, 14, 15, // Bottom
              16, 17, 18,   16, 18, 19, // Right
              20, 21, 22,   20, 22, 23  // Left
          ]
      }
  };
}
// Function to draw map objects
function drawMapObjects(gl, programInfo, mapObjects, viewProjectionMatrix) {
  // Collect sphere light information
  const sphereLights = mapObjects
      .filter(obj => obj.type === 'sphere')
      .slice(0, 28)  // Limit to 10 lights maximum
      .map(sphere => ({
          position: sphere.object.position,
          color: sphere.arrays.a_emissiveColor.data.slice(0, 4)  // Get the first color (they're all the same)
      }));

  const sphereLightPositions = new Float32Array(sphereLights.flatMap(light => light.position));
  const sphereLightColors = new Float32Array(sphereLights.flatMap(light => light.color));

  for (const mapObj of mapObjects) {
      const bufferInfo = twgl.createBufferInfoFromArrays(gl, mapObj.arrays);
      const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);
      
      gl.bindVertexArray(vao);
      
      const worldMatrix = twgl.m4.identity();
      const cube_trans = twgl.v3.create(...mapObj.object.position);
      const cube_scale = twgl.v3.create(...mapObj.object.scale);
      
      twgl.m4.translate(worldMatrix, cube_trans, worldMatrix);
      twgl.m4.rotateX(worldMatrix, mapObj.object.rotation[0], worldMatrix);
      twgl.m4.rotateY(worldMatrix, mapObj.object.rotation[1], worldMatrix);
      twgl.m4.rotateZ(worldMatrix, mapObj.object.rotation[2], worldMatrix);
      twgl.m4.scale(worldMatrix, cube_scale, worldMatrix);
      
      const uniforms = {
          u_world: worldMatrix,
          u_worldViewProjection: twgl.m4.multiply(viewProjectionMatrix, worldMatrix),
          u_worldInverseTransform: twgl.m4.transpose(twgl.m4.inverse(worldMatrix)),
          u_sphereLightPositions: sphereLightPositions,
          u_sphereLightColors: sphereLightColors,
          u_numSphereLights: sphereLights.length,
          u_emissiveFactor: mapObj.type === 'sphere' ? 1.0 : 0.0
      };
      
      twgl.setUniforms(programInfo, uniforms);
      twgl.drawBufferInfo(gl, bufferInfo);
  }
}

const gridString = `
v<<<<<<<<<<<<<<<<s<<<<<<<<<<<<
vv<<<<<<<<<<<<<<<s<<<<<<<<<<<^
vv##^###^###vv#SS#####D#####^^
vv##^#D#^###vv#^^<<<<<<<<<<<^^
vv>>>>>>>>>>vv#^^<<<<<<<<<<<^^
vv#Dv#v#^#v#vv#^^###########^^
vv##v#v#^Dv#vv#^^>>>>>>>>>>>^^
vv<<<<<<<<v<vv#^^>>>>>>>>>>>^^
vv#Dv#D###v#vv#^^####vv##D##^^
vv>>>>>>>>v>vv#^^D###vv#####^^
vv##S##D##v#vv#^^####SS#####^^
vv<<<s<<<<<<<<<<<<<<<<<s<<<<^^
vv<<<s<<<<<<<<<<<<<<<<<s<<<<^^
vv#########vv###^^##########^^
vv########Dvv###^^##########^^
vv#########vv###^^###D######^^
vv>>>s>>>>>>>>>>>>>>>>>>>>>s^^
vv>>>s>>>>>>>>>>>>>>>>>>>>>s^^
vv#vv#SS####vv#^^####vv#####SS
vv#vv#^^D###vv#^^###Dvv#####^^
vv#vv#^^####vv#^^####vv#####^^
vv#vv#^^#D##vv#^^####vv#####^^
vv#vv#^^<<<<vv<^^<<<<vv<<<<<^^
vv#vv#^^<<<<vv<^^<<<<vv<<<<<^^
vv#vv#^^####vv#^^#D##vv#####^^
vv#vv#^^D###vv#^^####vv#####^^
vv#vv#^^####vv#^^####vv#####^^
vv#vv#^^####SS#^^####SS##D##^^
v>>>>>>>>>>s>>>>>>>>s>>>>>>>^^
>>>>>>>>>>>s>>>>>>>>s>>>>>>>>^`;
  const mapObjects = generateMapFromGrid(gridString);


  function generateSphereData(radius, segments, emissiveColor = [0, 0, 0, 1]) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const ambientColors = [];
    const diffuseColors = [];
    const specularColors = [];
    const emissiveColors = [];
    const shininess = [];
    
    // Generate vertices
    for (let lat = 0; lat <= segments; lat++) {
        const theta = lat * Math.PI / segments;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        
        for (let lon = 0; lon <= segments; lon++) {
            const phi = lon * 2 * Math.PI / segments;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            
            const x = cosPhi * sinTheta;
            const y = cosTheta;
            const z = sinPhi * sinTheta;
            
            positions.push(radius * x, radius * y, radius * z);
            normals.push(x, y, z);
            
            // Add emission color
            emissiveColors.push(...emissiveColor);
            
            // Standard material properties
            const white = [1, 1, 1, 1];
            colors.push(...white);
            ambientColors.push(0.3, 0.3, 0.3, 1.0);
            diffuseColors.push(...white);
            specularColors.push(0.8, 0.8, 0.8, 1.0);
            shininess.push(100);
        }
    }
    
    // Generate indices (same as before)
    for (let lat = 0; lat < segments; lat++) {
        for (let lon = 0; lon < segments; lon++) {
            const first = (lat * (segments + 1)) + lon;
            const second = first + segments + 1;
            
            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }
    
    return {
        a_position: { numComponents: 3, data: positions },
        a_normal: { numComponents: 3, data: normals },
        a_ambientColor: { numComponents: 4, data: ambientColors },
        a_diffuseColor: { numComponents: 4, data: diffuseColors },
        a_specularColor: { numComponents: 4, data: specularColors },
        a_emissiveColor: { numComponents: 4, data: emissiveColors },
        a_shininess: { numComponents: 1, data: shininess },
        indices: { numComponents: 3, data: indices }
    };
}

async function getTrafficLights() {
    try {
        let response = await fetch(agent_server_uri + "getTrafficLights");
        if(response.ok) {
            let result = await response.json();
            console.log("Traffic Lights Status:", result.positions);
            updateTrafficLightColors(result.positions);
        }
    } catch (error) {
        console.log("Error fetching traffic lights:", error);
    }
}

function updateTrafficLightColors(trafficLights) {
    for (const light of trafficLights) {
        const sphere = mapObjects.find(obj => 
            obj.type === 'sphere' && 
            Math.abs(obj.object.position[0] - light.x) < 0.1 && 
            Math.abs(obj.object.position[1] - light.y) < 0.1
        );

        if (sphere) {
            // Use the state property directly to determine color
            const isGreen = light.state;
            const baseColor = isGreen ? [0, 1, 0, 1] : [1, 0, 0, 1];
            const emissiveIntensity = 1.0; // Increased for better visibility
            
            const numVertices = sphere.arrays.a_position.data.length / 3;
            
            // Update sphere colors
            sphere.arrays.a_diffuseColor = {
                numComponents: 4,
                data: Array(numVertices * 4).fill(0).map((_, i) => {
                    const component = baseColor[i % 4];
                    return isGreen ? component : component * 0.9; // Slightly dim red for better contrast
                })
            };
            
            // Adjust ambient for better color distinction
            sphere.arrays.a_ambientColor = {
                numComponents: 4,
                data: Array(numVertices * 4).fill(0).map((_, i) => {
                    const component = baseColor[i % 4];
                    return component * (isGreen ? 0.3 : 0.2); // Different ambient for red/green
                })
            };
            
            // Enhanced emission for better visibility
            sphere.arrays.a_emissiveColor = {
                numComponents: 4,
                data: Array(numVertices * 4).fill(0).map((_, i) => {
                    const component = baseColor[i % 4];
                    return component * (isGreen ? emissiveIntensity : emissiveIntensity * 0.8);
                })
            };
            
            // Specular highlights for better 3D appearance
            sphere.arrays.a_specularColor = {
                numComponents: 4,
                data: Array(numVertices * 4).fill([0.9, 0.9, 0.9, 1.0]).flat()
            };
            
            // Update buffers
            const bufferInfo = twgl.createBufferInfoFromArrays(gl, sphere.arrays);
            sphere.bufferInfo = bufferInfo;
            sphere.vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);
            
            // Log state change for debugging
            console.log(`Traffic Light ${light.id} at (${light.x}, ${light.y}) is ${isGreen ? 'GREEN' : 'RED'}`);
        }
    }
}

function parseOBJ(objText) {
    const positions = [];
    const texcoords = [];
    const normals = [];
    const indices = [];
    const materialIndices = [];
    
    // Original vertex arrays from the OBJ file
    const origPositions = [];
    const origTexcoords = [];
    const origNormals = [];
    
    const materialNameToIndex = new Map();
    let materialIndexCounter = 0;
    let currentMaterialIndex = 0;

    const lines = objText.split('\n');
    
    // First pass: collect all vertices
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const command = parts[0];
        
        switch (command) {
            case 'v':  // Vertex position
                origPositions.push(
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                );
                break;
                
            case 'vt':  // Texture coordinates
                origTexcoords.push(
                    parseFloat(parts[1]),
                    parseFloat(parts[2])
                );
                break;
                
            case 'vn':  // Vertex normal
                origNormals.push(
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                );
                break;
        }
    }

    // Create a vertex cache to handle vertex reuse
    const vertexCache = new Map();
    let vertexCount = 0;

    // Second pass: process faces and materials
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const command = parts[0];

        if (command === 'usemtl') {
            const materialName = parts[1];
            if (!materialNameToIndex.has(materialName)) {
                materialNameToIndex.set(materialName, materialIndexCounter++);
            }
            currentMaterialIndex = materialNameToIndex.get(materialName);
        }
        else if (command === 'f') {
            // Handle faces with more than 3 vertices by triangulating
            const faceVertices = parts.slice(1);
            
            // Triangulate the face if it has more than 3 vertices
            for (let i = 1; i < faceVertices.length - 1; i++) {
                const vertexData = [faceVertices[0], faceVertices[i], faceVertices[i + 1]];
                
                // Process each vertex of the triangle
                vertexData.forEach(vertex => {
                    // Create a unique key for the vertex combination
                    const vertexKey = vertex;
                    
                    if (!vertexCache.has(vertexKey)) {
                        // Parse vertex indices
                        const [posIndex, texIndex, normIndex] = vertex.split('/').map(v => parseInt(v) || 0);
                        
                        // Add vertex data (adjust indices to be 0-based)
                        if (posIndex > 0) {
                            positions.push(
                                origPositions[(posIndex - 1) * 3],
                                origPositions[(posIndex - 1) * 3 + 1],
                                origPositions[(posIndex - 1) * 3 + 2]
                            );
                        }
                        
                        if (texIndex > 0) {
                            texcoords.push(
                                origTexcoords[(texIndex - 1) * 2],
                                origTexcoords[(texIndex - 1) * 2 + 1]
                            );
                        }
                        
                        if (normIndex > 0) {
                            normals.push(
                                origNormals[(normIndex - 1) * 3],
                                origNormals[(normIndex - 1) * 3 + 1],
                                origNormals[(normIndex - 1) * 3 + 2]
                            );
                        }
                        
                        vertexCache.set(vertexKey, vertexCount);
                        materialIndices.push(currentMaterialIndex);
                        vertexCount++;
                    }
                    
                    indices.push(vertexCache.get(vertexKey));
                });
            }
        }
    }
    
    return {
        positions,
        texcoords,
        normals,
        indices,
        materialIndices,
        materialNameToIndex
    };
}

// Function to parse MTL file content
function parseMTL(mtlText) {
    const materials = new Map();
    let currentMaterial = null;

    const lines = mtlText.split('\n');
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const command = parts[0];

        switch (command) {
            case 'newmtl':
                currentMaterial = {
                    name: parts[1],
                    ambient: [0.2, 0.2, 0.2],
                    diffuse: [0.8, 0.8, 0.8],
                    specular: [1.0, 1.0, 1.0],
                    emission: [0.0, 0.0, 0.0],
                    shininess: 100,
                    alpha: 1.0
                };
                materials.set(currentMaterial.name, currentMaterial);
                console.log(`Created new material: ${currentMaterial.name}`);
                break;

            case 'Ka':  // Ambient color
                if (currentMaterial) {
                    currentMaterial.ambient = [
                        parseFloat(parts[1]),
                        parseFloat(parts[2]),
                        parseFloat(parts[3])
                    ];
                    console.log(`Set ambient for ${currentMaterial.name}:`, currentMaterial.ambient);
                }
                break;

            case 'Kd':  // Diffuse color
                if (currentMaterial) {
                    currentMaterial.diffuse = [
                        parseFloat(parts[1]),
                        parseFloat(parts[2]),
                        parseFloat(parts[3])
                    ];
                    console.log(`Set diffuse for ${currentMaterial.name}:`, currentMaterial.diffuse);
                }
                break;

            case 'Ks':  // Specular color
                if (currentMaterial) {
                    currentMaterial.specular = [
                        parseFloat(parts[1]),
                        parseFloat(parts[2]),
                        parseFloat(parts[3])
                    ];
                    console.log(`Set specular for ${currentMaterial.name}:`, currentMaterial.specular);
                }
                break;

            case 'Ke':  // Emission color
                if (currentMaterial) {
                    currentMaterial.emission = [
                        parseFloat(parts[1]),
                        parseFloat(parts[2]),
                        parseFloat(parts[3])
                    ];
                }
                break;

            case 'Ns':  // Shininess
                if (currentMaterial) {
                    currentMaterial.shininess = parseFloat(parts[1]);
                }
                break;

            case 'd':   // Dissolve (transparency)
            case 'Tr':  // Transparency
                if (currentMaterial) {
                    currentMaterial.alpha = parseFloat(parts[1]);
                }
                break;
        }
    }

    // Add some predefined colors for common material names if they're not set
    materials.forEach((material, name) => {
        if (material.diffuse.every(v => v === 0 || v === 0.8)) {
            switch(name.toLowerCase()) {
                case 'black':
                    material.diffuse = [0.02, 0.02, 0.02];
                    break;
                case 'body':
                    material.diffuse = [0.8, 0.0, 0.0]; // Red car body
                    break;
                case 'lights':
                    material.diffuse = [1.0, 1.0, 0.8];
                    material.emission = [0.5, 0.5, 0.3];
                    break;
                case 'window':
                    material.diffuse = [0.3, 0.3, 0.8];
                    material.alpha = 0.7;
                    break;
                case 'tires':
                    material.diffuse = [0.1, 0.1, 0.1];
                    break;
                case 'wheels':
                    material.diffuse = [0.7, 0.7, 0.7];
                    material.specular = [0.9, 0.9, 0.9];
                    break;
                case 'bumpers':
                    material.diffuse = [0.8, 0.8, 0.8];
                    material.specular = [1.0, 1.0, 1.0];
                    break;
            }
        }
    });

    return materials;
}

// Function to generate buffer data from OBJ and MTL
function generateDataFromOBJ(objData, materials, size = 1) {
    // Create array of materials indexed by their numeric indices
    const materialArray = Array.from(objData.materialNameToIndex.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => materials.get(name) || {
            ambient: [0.2, 0.2, 0.2],
            diffuse: [0.8, 0.8, 0.8],
            specular: [1.0, 1.0, 1.0],
            shininess: 100,
            alpha: 1.0
        });

    // Create arrays for the buffer data
    const positions = [];
    const normals = [];
    const ambientColors = [];
    const diffuseColors = [];
    const specularColors = [];
    const shininess = [];
    const finalIndices = [];
    
    // Process each vertex
    for (let i = 0; i < objData.positions.length; i += 3) {
        // Scale positions by size
        positions.push(
            objData.positions[i] * size,
            objData.positions[i + 1] * size,
            objData.positions[i + 2] * size
        );
        
        // Add normals if they exist
        if (objData.normals.length > 0) {
            normals.push(
                objData.normals[i],
                objData.normals[i + 1],
                objData.normals[i + 2]
            );
        }
        
        // Get material using the numeric index
        const materialIndex = objData.materialIndices[Math.floor(i / 3)];
        const material = materialArray[materialIndex];
        
        // Add material properties
        ambientColors.push(...material.ambient, material.alpha);
        diffuseColors.push(...material.diffuse, material.alpha);
        specularColors.push(...material.specular, material.alpha);
        shininess.push(material.shininess);
    }
    
    // Copy indices
    finalIndices.push(...objData.indices);
    
    // Return the buffer arrays
    return {
        a_position: {
            numComponents: 3,
            data: positions
        },
        a_normal: {
            numComponents: 3,
            data: normals.length > 0 ? normals : generateDefaultNormals(positions, finalIndices)
        },
        a_ambientColor: {
            numComponents: 4,
            data: ambientColors
        },
        a_diffuseColor: {
            numComponents: 4,
            data: diffuseColors
        },
        a_specularColor: {
            numComponents: 4,
            data: specularColors
        },
        a_shininess: {
            numComponents: 1,
            data: shininess
        },
        indices: {
            numComponents: 3,
            data: finalIndices
        }
    };
}

// Helper function to generate default normals if none are provided
function generateDefaultNormals(positions, indices) {
    const normals = new Array(positions.length).fill(0);
    
    // Calculate normals for each face
    for (let i = 0; i < indices.length; i += 3) {
        const i1 = indices[i] * 3;
        const i2 = indices[i + 1] * 3;
        const i3 = indices[i + 2] * 3;
        
        // Get vertices of the triangle
        const v1 = positions.slice(i1, i1 + 3);
        const v2 = positions.slice(i2, i2 + 3);
        const v3 = positions.slice(i3, i3 + 3);
        
        // Calculate vectors of two edges
        const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
        const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
        
        // Calculate cross product
        const normal = [
            edge1[1] * edge2[2] - edge1[2] * edge2[1],
            edge1[2] * edge2[0] - edge1[0] * edge2[2],
            edge1[0] * edge2[1] - edge1[1] * edge2[0]
        ];
        
        // Add to normal array
        for (const idx of [i1, i2, i3]) {
            normals[idx] += normal[0];
            normals[idx + 1] += normal[1];
            normals[idx + 2] += normal[2];
        }
    }
    
    // Normalize all normals
    for (let i = 0; i < normals.length; i += 3) {
        const length = Math.sqrt(
            normals[i] * normals[i] +
            normals[i + 1] * normals[i + 1] +
            normals[i + 2] * normals[i + 2]
        );
        if (length > 0) {
            normals[i] /= length;
            normals[i + 1] /= length;
            normals[i + 2] /= length;
        }
    }
    
    return normals;
}

// Function to load OBJ and MTL files
async function loadModelData(objUrl, mtlUrl, size = 1) {
    try {
        const objResponse = await fetch(objUrl);
        const mtlResponse = await fetch(mtlUrl);
        
        if (!objResponse.ok || !mtlResponse.ok) {
            throw new Error(`Failed to load models: OBJ ${objResponse.status}, MTL ${mtlResponse.status}`);
        }

        const objText = await objResponse.text();
        const mtlText = await mtlResponse.text();
        
        // Log the first few lines of each file for debugging
        console.log('First 10 lines of OBJ:', objText.split('\n').slice(0, 10));
        console.log('First 10 lines of MTL:', mtlText.split('\n').slice(0, 10));
        
        const materials = parseMTL(mtlText);
        console.log('Parsed MTL materials:', 
            Array.from(materials.entries()).map(([name, mat]) => ({
                name,
                ambient: mat.ambient,
                diffuse: mat.diffuse,
                specular: mat.specular,
                shininess: mat.shininess
            }))
        );
        
        const objData = parseOBJ(objText);
        console.log('OBJ Data summary:', {
            vertexCount: objData.positions.length / 3,
            normalCount: objData.normals.length / 3,
            faceCount: objData.indices.length / 3,
            uniqueMaterials: new Set(objData.materialIndices).size,
            materialIndexRange: [
                Math.min(...objData.materialIndices),
                Math.max(...objData.materialIndices)
            ]
        });
        
        return generateDataFromOBJ(objData, materials, size);
    } catch (error) {
        console.error('Error in loadModelData:', error);
        return generateData(size);
    }
}

main()