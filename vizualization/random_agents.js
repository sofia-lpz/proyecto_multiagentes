'use strict';

import * as twgl from 'twgl.js';
import GUI from 'lil-gui';

// Define the vertex shader code, using GLSL 3.00
import vsGLSL from "./assets/vs_phong.glsl?raw";
// Import the fragment shader code, using GLSL 3.00
import fsGLSL from "./assets/fs_phong.glsl?raw";

// Define the Object3D class to represent 3D objects
class Object3D {
  constructor(id, position=[0,0,0], rotation=[0,0,0], scale=[1,1,1]){
    this.id = id;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.matrix = twgl.m4.create();
  }
}

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

    try {
        // Load the 3D model for agents
        // Replace these paths with your actual model file paths
        agentModelData = await loadModelData(
            '/assets/models/Car.obj',  // path to your OBJ file
            '/assets/models/Car.mtl',  // path to your MTL file
            0.5  // scale factor for the model
        );
    } catch (error) {
        console.error('Failed to load agent model:', error);
        // Fallback to basic cube if model loading fails
        agentModelData = generateData(1);
    }
    
    // Use the loaded model data for agents
    agentArrays = agentModelData;
    
    // Create obstacle data as before
    obstacleArrays = generateObstacleData(1);

    // Create buffer information from the agent and obstacle data
    agentsBufferInfo = twgl.createBufferInfoFromArrays(gl, agentArrays);
    obstaclesBufferInfo = twgl.createBufferInfoFromArrays(gl, obstacleArrays);

    // Create vertex array objects (VAOs) from the buffer information
    agentsVao = twgl.createVAOFromBufferInfo(gl, programInfo, agentsBufferInfo);
    obstaclesVao = twgl.createVAOFromBufferInfo(gl, programInfo, obstaclesBufferInfo);

    // Set up the user interface
    setupUI();

    // Initialize the agents model
    await initAgentsModel();

    // Get the agents and obstacles
    await getAgents();
    await getObstacles();
  

    // Draw the scene
    await drawScene(gl, programInfo, agentsVao, agentsBufferInfo, obstaclesVao, obstaclesBufferInfo);
}
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
    // Send a GET request to the agent server to retrieve the agent positions
    let response = await fetch(agent_server_uri + "getAgents") 

    // Check if the response was successful
    if(response.ok){
      // Parse the response as JSON
      let result = await response.json()

      // Log the agent positions
      console.log(result.positions)

      // Check if the agents array is empty
      if(agents.length == 0){
        // Create new agents and add them to the agents array
        for (const agent of result.positions) {
          const newAgent = new Object3D(agent.id, [agent.x, agent.y, agent.z])
          agents.push(newAgent)
        }
        // Log the agents array
        console.log("Agents:", agents)

      } else {
        // Create a set of current agent IDs from the server response
        const currentAgentIds = new Set(result.positions.map(agent => agent.id));
        
        // Remove agents that no longer exist in the server response
        agents.forEach((agent, index) => {
          if (!currentAgentIds.has(agent.id)) {
            agents.splice(index, 1);
          }
        });

        // Update positions of existing agents and add new ones
        for (const agent of result.positions) {
          const current_agent = agents.find((object3d) => object3d.id == agent.id)

          if(current_agent != undefined){
            // Update the agent's position
            current_agent.position = [agent.x, agent.y, agent.z]
          } else {
            // If agent doesn't exist, create a new one
            const newAgent = new Object3D(agent.id, [agent.x, agent.y, agent.z])
            agents.push(newAgent)
          }
        }
      }
    }

  } catch (error) {
    // Log any errors that occur during the request
    console.log(error) 
  }
}
/*
 * Retrieves the current positions of all obstacles from the agent server.
 */
async function getObstacles() {
  try {
    // Send a GET request to the agent server to retrieve the obstacle positions
    let response = await fetch(agent_server_uri + "getObstacles") 

    // Check if the response was successful
    if(response.ok){
      // Parse the response as JSON
      let result = await response.json()

      // Create new obstacles and add them to the obstacles array
      for (const obstacle of result.positions) {
        const newObstacle = new Object3D(obstacle.id, [obstacle.x, obstacle.y, obstacle.z])
        obstacles.push(newObstacle)
      }
      // Log the obstacles array
      console.log("Obstacles:", obstacles)
    }

  } catch (error) {
    // Log any errors that occur during the request
    console.log(error) 
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
async function drawScene(gl, programInfo, agentsVao, agentsBufferInfo, obstaclesVao, obstaclesBufferInfo) {
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.clearColor(0.2, 0.2, 0.2, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(programInfo.program);

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
  drawObstacles(1, obstaclesVao, obstaclesBufferInfo, viewProjectionMatrix);

  frameCount++;
  if(frameCount%20 == 0){
      frameCount = 0;
      await update();
      await getTrafficLights(); // Add traffic light update
  } 

  requestAnimationFrame(()=>drawScene(gl, programInfo, agentsVao, agentsBufferInfo, obstaclesVao, obstaclesBufferInfo));
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
function drawObstacles(distance, obstaclesVao, obstaclesBufferInfo, viewProjectionMatrix){
    // Bind the vertex array object for obstacles
    gl.bindVertexArray(obstaclesVao);

    // Iterate over the obstacles
    for(const obstacle of obstacles){
      // Create the obstacle's transformation matrix
      const cube_trans = twgl.v3.create(...obstacle.position);
      const cube_scale = twgl.v3.create(...obstacle.scale);

      // Calculate the obstacle's matrix
      obstacle.matrix = twgl.m4.translate(viewProjectionMatrix, cube_trans);
      obstacle.matrix = twgl.m4.rotateX(obstacle.matrix, obstacle.rotation[0]);
      obstacle.matrix = twgl.m4.rotateY(obstacle.matrix, obstacle.rotation[1]);
      obstacle.matrix = twgl.m4.rotateZ(obstacle.matrix, obstacle.rotation[2]);
      obstacle.matrix = twgl.m4.scale(obstacle.matrix, cube_scale);

      // Set the uniforms for the obstacle
      let uniforms = {
          u_matrix: obstacle.matrix,
      }

      // Set the uniforms and draw the obstacle
      twgl.setUniforms(programInfo, uniforms);
      twgl.drawBufferInfo(gl, obstaclesBufferInfo);
      
    }
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
  const posFolder = gui.addFolder('Camera Position:')
  posFolder.add(cameraPosition, 'x', -110, 110)
      .onChange(value => {
          cameraPosition.x = value;
      });
  posFolder.add(cameraPosition, 'y', -110, 110)
      .onChange(value => {
          cameraPosition.y = value;
      });
  posFolder.add(cameraPosition, 'z', -110, 110)
      .onChange(value => {
          cameraPosition.z = value;
      });
  
  // Camera Target folder
  const targetFolder = gui.addFolder('Camera Target:')
  targetFolder.add(cameraTarget, 'x', -110, 110)
      .onChange(value => {
          cameraTarget.x = value;
      });
  targetFolder.add(cameraTarget, 'y', -110, 110)
      .onChange(value => {
          cameraTarget.y = value;
      });
  targetFolder.add(cameraTarget, 'z', -110, 110)
      .onChange(value => {
          cameraTarget.z = value;
      });
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

function generateObstacleData(size){

    let arrays =
    {
        a_position: {
                numComponents: 3,
                data: [
                  // Front Face
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
                 -0.5,  0.5, -0.5
                ].map(e => size * e)
            },
        a_color: {
                numComponents: 4,
                data: [
                  // Front face
                    0, 0, 0, 1, // v_1
                    0, 0, 0, 1, // v_1
                    0, 0, 0, 1, // v_1
                    0, 0, 0, 1, // v_1
                  // Back Face
                    0.333, 0.333, 0.333, 1, // v_2
                    0.333, 0.333, 0.333, 1, // v_2
                    0.333, 0.333, 0.333, 1, // v_2
                    0.333, 0.333, 0.333, 1, // v_2
                  // Top Face
                    0.5, 0.5, 0.5, 1, // v_3
                    0.5, 0.5, 0.5, 1, // v_3
                    0.5, 0.5, 0.5, 1, // v_3
                    0.5, 0.5, 0.5, 1, // v_3
                  // Bottom Face
                    0.666, 0.666, 0.666, 1, // v_4
                    0.666, 0.666, 0.666, 1, // v_4
                    0.666, 0.666, 0.666, 1, // v_4
                    0.666, 0.666, 0.666, 1, // v_4
                  // Right Face
                    0.833, 0.833, 0.833, 1, // v_5
                    0.833, 0.833, 0.833, 1, // v_5
                    0.833, 0.833, 0.833, 1, // v_5
                    0.833, 0.833, 0.833, 1, // v_5
                  // Left Face
                    1, 1, 1, 1, // v_6
                    1, 1, 1, 1, // v_6
                    1, 1, 1, 1, // v_6
                    1, 1, 1, 1, // v_6
                ]
            },
        indices: {
                numComponents: 3,
                data: [
                  0, 1, 2,      0, 2, 3,    // Front face
                  4, 5, 6,      4, 6, 7,    // Back face
                  8, 9, 10,     8, 10, 11,  // Top face
                  12, 13, 14,   12, 14, 15, // Bottom face
                  16, 17, 18,   16, 18, 19, // Right face
                  20, 21, 22,   20, 22, 23  // Left face
                ]
            }
    };
    return arrays;
}

function generateMapFromGrid(gridString) {
  // Split the string into rows and reverse to start from bottom
  const rows = gridString.trim().split('\n').reverse();
  const mapObjects = [];
  
  // Define colors for each symbol
  const symbolColors = {
      '>': [0, 0, 1, 1],     // Blue
      '<': [1, 0, 0, 1],     // Red
      'S': [0.5, 0.5, 0.5, 1], // Gray for traffic_v
      's': [0.5, 0.5, 0.5, 1], // Gray for traffic_h
      '#': [0.7, 0.9, 1, 1], // Light blue
      'v': [1, 1, 0, 1],     // Yellow
      '^': [0.5, 0, 0.5, 1], // Purple
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
                  [x, y, -1], // Position with y at -0.3
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

    // Second pass: process faces and materials
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const command = parts[0];

        if (command === 'usemtl') {
            // Convert material name to index
            const materialName = parts[1];
            if (!materialNameToIndex.has(materialName)) {
                console.log('Adding new material:', materialName, 'with index:', materialIndexCounter);
                materialNameToIndex.set(materialName, materialIndexCounter++);
            }
            currentMaterialIndex = materialNameToIndex.get(materialName);
            console.log('Switched to material:', materialName, 'index:', currentMaterialIndex);
        }
        else if (command === 'f') {
            // Process face
            for (let i = 1; i <= 3; i++) {
                const vertexData = parts[i].split('/');
                
                // Indices in OBJ files start at 1, so subtract 1
                const positionIdx = parseInt(vertexData[0]) - 1;
                const texcoordIdx = vertexData[1] ? parseInt(vertexData[1]) - 1 : -1;
                const normalIdx = vertexData[2] ? parseInt(vertexData[2]) - 1 : -1;
                
                // Add the vertex data
                positions.push(
                    origPositions[positionIdx * 3],
                    origPositions[positionIdx * 3 + 1],
                    origPositions[positionIdx * 3 + 2]
                );
                
                if (texcoordIdx >= 0) {
                    texcoords.push(
                        origTexcoords[texcoordIdx * 2],
                        origTexcoords[texcoordIdx * 2 + 1]
                    );
                }
                
                if (normalIdx >= 0) {
                    normals.push(
                        origNormals[normalIdx * 3],
                        origNormals[normalIdx * 3 + 1],
                        origNormals[normalIdx * 3 + 2]
                    );
                }
                
                // Add vertex index and material index
                indices.push(indices.length);
                materialIndices.push(currentMaterialIndex);
            }
        }
    }
    
    console.log('Material name to index mapping:', Object.fromEntries(materialNameToIndex));
    console.log('Unique material indices used:', [...new Set(materialIndices)]);
    
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