from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from agent import *
import json

class CityModel(Model):
    def __init__(self, N):
        dataDictionary = json.load(open("city_files/mapDictionary.json"))
        self.traffic_lights = []

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
                        agent = Traffic_Light(f"tl_{r*self.width+c}", self, False if col == "S" else True, int(dataDictionary[col]))
                        self.grid.place_agent(agent, (c, self.height - r - 1))
                        self.schedule.add(agent)
                        self.traffic_lights.append(agent)
                        
                        road_direction = None
                        if r > 0 and lines[r-1][c] in ["v", "^"]:
                            road_direction = dataDictionary[lines[r-1][c]]
                        elif r < len(lines)-1 and lines[r+1][c] in ["v", "^"]:
                            road_direction = dataDictionary[lines[r+1][c]]
                        elif c > 0 and lines[r][c-1] in [">", "<"]:
                            road_direction = dataDictionary[lines[r][c-1]]
                        elif c < len(lines[r])-1 and lines[r][c+1] in [">", "<"]:
                            road_direction = dataDictionary[lines[r][c+1]]
                        
                        if road_direction:
                            road = Road(f"r_{r*self.width+c}", self, road_direction)
                            self.grid.place_agent(road, (c, self.height - r - 1))

                    elif col == "#":
                        agent = Obstacle(f"ob_{r*self.width+c}", self)
                        self.grid.place_agent(agent, (c, self.height - r - 1))

                    elif col == "D":
                        agent = Destination(f"d_{r*self.width+c}", self)
                        self.grid.place_agent(agent, (c, self.height - r - 1))
                        
                        print(f"\nChecking destination at position ({r}, {c})")
                        road_direction = None
                        
                        # Only look for road symbols, not obstacles
                        road_symbols = ["v", "^", ">", "<"]
                        
                        # Check above
                        if r > 0 and lines[r-1][c] in road_symbols:
                            print(f"Above cell contains: {lines[r-1][c]}")
                            road_direction = dataDictionary[lines[r-1][c]]
                            print(f"Found road above, direction: {road_direction}")
                        
                        # Check below
                        elif r < len(lines)-1 and lines[r+1][c] in road_symbols:
                            print(f"Below cell contains: {lines[r+1][c]}")
                            road_direction = dataDictionary[lines[r+1][c]]
                            print(f"Found road below, direction: {road_direction}")
                        
                        # Check left
                        elif c > 0 and lines[r][c-1] in road_symbols:
                            print(f"Left cell contains: {lines[r][c-1]}")
                            road_direction = dataDictionary[lines[r][c-1]]
                            print(f"Found road to left, direction: {road_direction}")
                        
                        # Check right
                        elif c < len(lines[r])-1 and lines[r][c+1] in road_symbols:
                            print(f"Right cell contains: {lines[r][c+1]}")
                            road_direction = dataDictionary[lines[r][c+1]]
                            print(f"Found road to right, direction: {road_direction}")
                                
                        if road_direction is None:
                            print("No adjacent roads found, defaulting to Right")
                            road_direction = "Right"
                        
                        print(f"Final road direction: {road_direction}")
                        
                        road = Road(f"r_{r*self.width+c}", self, road_direction)
                        self.grid.place_agent(road, (c, self.height - r - 1))

        self.num_agents = N
        self.running = True

        destinations = []
        for cell in self.grid.coord_iter():
            cell_content = cell[0]
            for agent in cell_content:
                if isinstance(agent, Destination):
                    destinations.append(agent)

        if destinations:
            destination = self.random.choice(destinations)
            car = Car(f"car_0", self, destination)
            self.grid.place_agent(car, (0, 0))
            self.schedule.add(car)

    def step(self):
        self.schedule.step()