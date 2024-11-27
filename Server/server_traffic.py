from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from trafficBase.model import CityModel
from trafficBase.agent import Car, Obstacle, Traffic_Light, Road, Destination

# Initialize simulation variables
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

            # Create city model with specified number of agents
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
        try:
            carPositions = [
                {
                    "id": str(a.unique_id), 
                    "x": x, 
                    "y": 1, 
                    "z": z,
                    "direction": a.current_direction
                }
                for a, (x, z) in cityModel.grid.coord_iter()
                if isinstance(a, Car)
            ]
            return jsonify({'positions': carPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting car positions"}), 500

@app.route('/getTrafficLights', methods=['GET'])
@cross_origin()
def getTrafficLights():
    global cityModel

    if request.method == 'GET':
        try:
            trafficLightPositions = [
                {"id": str(a.unique_id), "x": x, "y": 1, "z": z, "state": a.state}
                for a, (x, z) in cityModel.grid.coord_iter()
                if isinstance(a, Traffic_Light)
            ]
            return jsonify({'positions': trafficLightPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting traffic light positions"}), 500

@app.route('/getObstacles', methods=['GET'])
@cross_origin()
def getObstacles():
    global cityModel

    if request.method == 'GET':
        try:
            obstaclePositions = [
                {"id": str(a.unique_id), "x": x, "y": 1, "z": z}
                for a, (x, z) in cityModel.grid.coord_iter()
                if isinstance(a, Obstacle)
            ]
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