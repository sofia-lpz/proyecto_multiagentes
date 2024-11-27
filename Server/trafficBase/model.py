from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from agent import *
import json

class CityModel(Model):
    def __init__(self, N):
        dataDictionary = json.load(open("city_files/mapDictionary.json"))
        self.traffic_lights = []

        # Define valid perpendicular turns based on the neighbor road's direction
        # This ensures cars can turn into the destination
        perpendicular_direction = {
            "Up": "Left",     # If neighbor road points up, destination road points left (car can turn left)
            "Down": "Right",  # If neighbor road points down, destination road points right (car can turn right)
            "Left": "Up",     # If neighbor road points left, destination road points up (car can turn up)
            "Right": "Down"   # If neighbor road points right, destination road points down (car can turn down)
        }

        with open('city_files/2022_base.txt') as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0])-1
            self.height = len(lines)

            self.grid = MultiGrid(self.width, self.height, torus = False) 
            self.schedule = RandomActivation(self)

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
                        neighbor_direction = None
                        neighbor_position = None
                        
                        road_symbols = ["v", "^", ">", "<"]
                        
                        # Check above
                        if r > 0 and lines[r-1][c] in road_symbols:
                            print(f"Above cell contains: {lines[r-1][c]}")
                            neighbor_direction = dataDictionary[lines[r-1][c]]
                            neighbor_position = "above"
                            print(f"Found road above, direction: {neighbor_direction}")
                        
                        # Check below
                        elif r < len(lines)-1 and lines[r+1][c] in road_symbols:
                            print(f"Below cell contains: {lines[r+1][c]}")
                            neighbor_direction = dataDictionary[lines[r+1][c]]
                            neighbor_position = "below"
                            print(f"Found road below, direction: {neighbor_direction}")
                        
                        # Check left
                        elif c > 0 and lines[r][c-1] in road_symbols:
                            print(f"Left cell contains: {lines[r][c-1]}")
                            neighbor_direction = dataDictionary[lines[r][c-1]]
                            neighbor_position = "left"
                            print(f"Found road to left, direction: {neighbor_direction}")
                        
                        # Check right
                        elif c < len(lines[r])-1 and lines[r][c+1] in road_symbols:
                            print(f"Right cell contains: {lines[r][c+1]}")
                            neighbor_direction = dataDictionary[lines[r][c+1]]
                            neighbor_position = "right"
                            print(f"Found road to right, direction: {neighbor_direction}")
                                
                        if neighbor_direction:
                            # Make road perpendicular in a way that allows cars to turn into it
                            road_direction = perpendicular_direction[neighbor_direction]
                            print(f"Setting perpendicular direction: {road_direction}")
                            print(f"This allows cars traveling {neighbor_direction} to turn into the destination")
                        else:
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