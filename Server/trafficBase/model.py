from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from agent import *
import json

class CityModel(Model):
    def __init__(self, N):
        dataDictionary = json.load(open("./city_files/mapDictionary.json"))
        self.traffic_lights = []

        # Define valid road directions based on neighbor position
        neighbor_to_road_direction = {
            "above": "Down",  # If neighbor is above, road should point down
            "below": "Up",    # If neighbor is below, road should point up
            "left": "Right",  # If neighbor is left, road should point right
            "right": "Left"   # If neighbor is right, road should point left
        }

        with open('./city_files/2024_base.txt') as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0])-1
            self.height = len(lines)

            self.grid = MultiGrid(self.width, self.height, torus = False) 
            self.schedule = RandomActivation(self)

            for r, row in enumerate(lines):
                for c, col in enumerate(row):
                    if col in ["V", "^", ">", "<"]:
                        agent = Road(f"r_{r*self.width+c}", self, dataDictionary[col])
                        self.grid.place_agent(agent, (c, self.height - r - 1))

                    elif col in ["S", "s"]:
                        agent = Traffic_Light(f"tl_{r*self.width+c}", self, False if col == "S" else True, int(dataDictionary[col]))
                        self.grid.place_agent(agent, (c, self.height - r - 1))
                        self.schedule.add(agent)
                        self.traffic_lights.append(agent)
                        
                        road_direction = "Up"
                        if r > 0 and lines[r-1][c] in ["V", "^"]:
                            road_direction = dataDictionary[lines[r-1][c]]
                        elif r < len(lines)-1 and lines[r+1][c] in ["V", "^"]:
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
                        
                        road_direction = "Right"  # Default direction
                        road_symbols = ["V", "^", ">", "<"]
                        
                        # Check all neighboring cells
                        neighbors = {
                            "above": (r > 0, r-1, c, lines[r-1][c] if r > 0 else None),
                            "below": (r < len(lines)-1, r+1, c, lines[r+1][c] if r < len(lines)-1 else None),
                            "left": (c > 0, r, c-1, lines[r][c-1] if c > 0 else None),
                            "right": (c < len(lines[r])-1, r, c+1, lines[r][c+1] if c < len(lines[r])-1 else None)
                        }
                        
                        # Find first valid neighbor with a road
                        for position, (is_valid, nr, nc, symbol) in neighbors.items():
                            if is_valid and symbol in road_symbols:
                                road_direction = neighbor_to_road_direction[position]
                                break
                        
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
            # First car
            destination = self.random.choice(destinations)
            car = Car(f"car_0", self, destination)
            self.grid.place_agent(car, (0, 0))
            self.schedule.add(car)
            
            # Second car with a different destination
            remaining_destinations = [d for d in destinations if d != destination]
            if remaining_destinations:
                destination2 = self.random.choice(remaining_destinations)
                car2 = Car(f"car_1", self, destination2)
                self.grid.place_agent(car2, (0, 1))
                self.schedule.add(car2)

            # Third car with a different destination
            remaining_destinations = [d for d in destinations if d != destination and d != destination2]
            if remaining_destinations:
                destination3 = self.random.choice(remaining_destinations)
                car3 = Car(f"car_2", self, destination3)
                self.grid.place_agent(car3, (0, 2))
                self.schedule.add(car3)
            
    def step(self):
        self.schedule.step()