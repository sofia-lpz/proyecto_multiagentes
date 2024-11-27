from agent import *
from model import CityModel
from mesa.visualization import CanvasGrid, BarChartModule
from mesa.visualization import ModularServer

def agent_portrayal(agent):
    if agent is None: return
    
    portrayal = {"Shape": "rect",
                 "Filled": "true",
                 "Layer": 1,
                 "w": 1,
                 "h": 1,
                 "text_color": "black",  # Add text color
                 "text": ""  # Initialize text field
                 }

    if (isinstance(agent, Road)):
        portrayal["Color"] = "grey"
        portrayal["Layer"] = 0
        # Add direction indicator
        direction_symbols = {
            "Right": "→",
            "Left": "←",
            "Up": "↑",
            "Down": "↓"
        }
        portrayal["text"] = direction_symbols.get(agent.direction, "")
        portrayal["text_color"] = "black"  # Make sure text is visible against grey
    
    if (isinstance(agent, Destination)):
        portrayal["Shape"] = "circle"
        portrayal["Color"] = "lightgreen"
        portrayal["Layer"] = 0
        portrayal["r"] = 0.8


    if (isinstance(agent, Traffic_Light)):
        portrayal["Shape"] = "circle"
        portrayal["Color"] = "rgba(255,0,0,0.6)" if not agent.state else "rgba(0,255,0,0.6)"
        portrayal["Layer"] = 2
        portrayal["w"] = 0.8
        portrayal["h"] = 0.8
        portrayal["r"] = 0.8

    if (isinstance(agent, Obstacle)):
        portrayal["Color"] = "cadetblue"
        portrayal["Layer"] = 0
        portrayal["w"] = 0.8
        portrayal["h"] = 0.8

    if (isinstance(agent, Car)):
        portrayal["Shape"] = "circle"  # Change shape to circle
        portrayal["Color"] = "blue"
        portrayal["Layer"] = 2
        portrayal["r"] = 0.8  # Use radius instead of width/height for circles

    return portrayal

width = 0
height = 0

with open('city_files/2022_base.txt') as baseFile:
    lines = baseFile.readlines()
    width = len(lines[0])-1
    height = len(lines)

model_params = {"N":5}

print(width, height)
grid = CanvasGrid(agent_portrayal, width, height, 500, 500)

server = ModularServer(CityModel, [grid], "Traffic Base", model_params)
                       
server.port = 8521 # The default
server.launch()