from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from agent import *
import json

class CityModel(Model):
    """ 
        Creates a model based on a city map.

        Args:
            N: Number of agents in the simulation
    """
    def __init__(self, N):

        # Load the map dictionary. The dictionary maps the characters in the map file to the corresponding agent.
        dataDictionary = json.load(open("city_files/mapDictionary.json"))

        self.traffic_lights = []

        # Load the map file. The map file is a text file where each character represents an agent.
        with open('city_files/2022_base.txt') as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0])-1
            self.height = len(lines)

            self.grid = MultiGrid(self.width, self.height, torus = False) 
            self.schedule = RandomActivation(self)

            # Goes through each character in the map file and creates the corresponding agent.
            for r, row in enumerate(lines):
                for c, col in enumerate(row):
                    if col in ["v", "^", ">", "<"]:
                        agent = Road(f"r_{r*self.width+c}", self, dataDictionary[col])
                        self.grid.place_agent(agent, (c, self.height - r - 1))

                    elif col in ["S", "s"]:
                        # Create traffic light
                        agent = Traffic_Light(f"tl_{r*self.width+c}", self, False if col == "S" else True, int(dataDictionary[col]))
                        self.grid.place_agent(agent, (c, self.height - r - 1))
                        self.schedule.add(agent)
                        self.traffic_lights.append(agent)
                        
                        # Find road direction by checking neighboring cells
                        road_direction = None
                        if r > 0 and lines[r-1][c] in ["v", "^"]:
                            road_direction = "Up" if lines[r-1][c] == "^" else "Down"
                        elif r < len(lines)-1 and lines[r+1][c] in ["v", "^"]:
                            road_direction = "Up" if lines[r+1][c] == "^" else "Down"
                        elif c > 0 and lines[r][c-1] in [">", "<"]:
                            road_direction = "Right" if lines[r][c-1] == ">" else "Left"
                        elif c < len(lines[r])-1 and lines[r][c+1] in [">", "<"]:
                            road_direction = "Right" if lines[r][c+1] == ">" else "Left"
                        
                        # Create road under traffic light
                        if road_direction:
                            road = Road(f"r_{r*self.width+c}", self, road_direction)
                            self.grid.place_agent(road, (c, self.height - r - 1))

                    elif col == "#":
                        agent = Obstacle(f"ob_{r*self.width+c}", self)
                        self.grid.place_agent(agent, (c, self.height - r - 1))

                    elif col == "D":
                        agent = Destination(f"d_{r*self.width+c}", self)
                        self.grid.place_agent(agent, (c, self.height - r - 1))

        self.num_agents = N
        self.running = True

        # First get all destinations from the grid
        destinations = []
        for cell in self.grid.coord_iter():
            cell_content = cell[0]  # cell is a tuple of (content, x, y)
            for agent in cell_content:
                if isinstance(agent, Destination):
                    destinations.append(agent)


        if destinations:  # Make sure there are destinations
            # Pick a random destination
            destination = self.random.choice(destinations)
            
            # Create car with destination
            car = Car(f"car_0", self, destination)
            self.grid.place_agent(car, (0, 0))
            self.schedule.add(car)

    def step(self):
        '''Advance the model by one step.'''
        self.schedule.step()