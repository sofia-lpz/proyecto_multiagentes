from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from agent import *
import json

class CityModel(Model):
    def __init__(self, N):
        dataDictionary = json.load(open("./city_files/mapDictionary.json"))
        self.traffic_lights = []
        self.car_count = 0  # Add counter for unique car IDs
        self.destinations = []  # Make destinations a class variable


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

        for cell in self.grid.coord_iter():
            cell_content = cell[0]
            for agent in cell_content:
                if isinstance(agent, Destination):
                    self.destinations.append(agent)


        destinations = []
        for cell in self.grid.coord_iter():
            cell_content = cell[0]
            for agent in cell_content:
                if isinstance(agent, Destination):
                    destinations.append(agent)

        destination = self.random.choice(self.destinations)
        car0 = Car(f"car_{self.car_count}", self, destination)
        self.grid.place_agent(car0, (0, 0))
        self.schedule.add(car0)
        self.car_count += 1
            
    def step(self):
        # Spawn cars every 2 steps
        """
        if self.schedule.steps % 10 == 0 and self.destinations:
            corners = [
                (0, 0),                    # Bottom left
                (0, self.height-1),        # Top left
                (self.width-1, 0),         # Bottom right
                (self.width-1, self.height-1) # Top right
            ]
            
            for corner in corners:
                # Check if position is empty
                cell_contents = self.grid.get_cell_list_contents(corner)
                if not any(isinstance(content, Car) for content in cell_contents):
                    destination = self.random.choice(self.destinations)
                    car = Car(f"car_{self.car_count}", self, destination)
                    self.grid.place_agent(car, corner)
                    self.schedule.add(car)
                    self.car_count += 1
        """

        self.schedule.step()