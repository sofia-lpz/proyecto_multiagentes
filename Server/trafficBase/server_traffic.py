from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from model import CityModel
from agent import Car, Obstacle, Traffic_Light, Road, Destination

cityModel = None
currentStep = 0

app = Flask("Traffic Simulation")
cors = CORS(app, origins=['http://localhost'])

@app.route('/init', methods=['POST'])
@cross_origin()
def initModel():
    global currentStep, cityModel
    if request.method == 'POST':
        try:
            number_agents = int(request.json.get('NAgents', 1))
            currentStep = 0
            cityModel = CityModel(number_agents)
            return jsonify({"message": "Traffic simulation model initiated successfully."})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error initializing model"}), 500

@app.route('/getAgents', methods=['GET'])
@cross_origin()
def getAgents():
    global cityModel
    if request.method == 'GET':
        if cityModel is None:
            return jsonify({"message": "Model not initialized"}), 400
            
        carPositions = []
        for cell_coords in cityModel.grid.coord_iter():
            agents = cell_coords[0]
            x, y = cell_coords[1]
            
            for agent in agents:
                if isinstance(agent, Car):
                    carPositions.append({
                        "id": str(agent.unique_id),
                        "x": x,
                        "y": y,
                        "direction": agent.current_direction
                    })
        
        return jsonify({'positions': carPositions})

@app.route('/getTrafficLights', methods=['GET'])
@cross_origin()
def getTrafficLights():
    global cityModel
    if request.method == 'GET':
        try:
            lightPositions = []
            for cell_coords in cityModel.grid.coord_iter():
                agents = cell_coords[0]
                x, y = cell_coords[1]
                
                for agent in agents:
                    if isinstance(agent, Traffic_Light):
                        lightPositions.append({
                            "id": str(agent.unique_id),
                            "x": x,
                            "y": y,
                            "state": agent.state
                        })
            
            return jsonify({'positions': lightPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting traffic light positions"}), 500

@app.route('/getObstacles', methods=['GET'])
@cross_origin()
def getObstacles():
    global cityModel
    if request.method == 'GET':
        try:
            obstaclePositions = []
            for cell_coords in cityModel.grid.coord_iter():
                agents = cell_coords[0]
                x, y = cell_coords[1]
                
                for agent in agents:
                    if isinstance(agent, Obstacle):
                        obstaclePositions.append({
                            "id": str(agent.unique_id),
                            "x": x,
                            "y": y
                        })
            
            return jsonify({'positions': obstaclePositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting obstacle positions"}), 500

@app.route('/update', methods=['GET'])
@cross_origin()
def updateModel():
    global currentStep, cityModel
    if request.method == 'GET':
        try:
            cityModel.step()
            currentStep += 1
            return jsonify({'message': f'Model updated to step {currentStep}.', 'currentStep': currentStep})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error updating model"}), 500

if __name__=='__main__':
    app.run(host="localhost", port=8585, debug=True)