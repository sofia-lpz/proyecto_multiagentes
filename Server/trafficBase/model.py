from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from agent import *
import json
from mesa.datacollection import DataCollector
from collections import defaultdict

class CityGraph:
    def __init__(self):
        self.nodes = {}  # (x,y) -> node_id
        self.edges = {}  # (node_id1, node_id2) -> weight
        self.node_counter = 0
    
    def add_node(self, pos):
        if pos not in self.nodes:
            self.nodes[pos] = self.node_counter
            self.node_counter += 1
        return self.nodes[pos]
    
    def add_edge(self, pos1, pos2, weight):
        node1 = self.nodes[pos1]
        node2 = self.nodes[pos2]
        self.edges[(node1, node2)] = weight

class CityModel(Model):
    def __init__(self, N):
        with open('./city_files/mapDictionary.json') as mapDictionary:
            dataDictionary = json.load(mapDictionary)
            
        self.traffic_lights = []
        self.car_count = 0
        self.cars_completed = 0
        self.destinations = []
        self.total_episodes = 0
        self.intersection_graph = CityGraph()

        self.datacollector = DataCollector(
            model_reporters={
                "Active Cars": lambda m: len([a for a in m.schedule.agents if isinstance(a, Car)]),
                "Completed Cars": lambda m: m.cars_completed,
                "Average Completed Cars": lambda m: m.cars_completed / m.total_episodes
            }
        )

        neighbor_to_road_direction = {
            "above": "Down",
            "below": "Up",
            "left": "Right",
            "right": "Left"
        }

        with open('./city_files/2024_base.txt') as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0])-1
            self.height = len(lines)

            self.grid = MultiGrid(self.width, self.height, torus=False)
            self.schedule = RandomActivation(self)

            # Create agents based on map file
            for r, row in enumerate(lines):
                for c, col in enumerate(row):
                    if col in ["V", "^", ">", "<"]:
                        agent = Road(f"r_{r*self.width+c}", self, dataDictionary[col])
                        self.grid.place_agent(agent, (c, self.height - r - 1))

                    elif col in ["S", "s"]:
                        agent = Traffic_Light(f"tl_{r*self.width+c}", self, 
                                           False if col == "S" else True, 
                                           int(dataDictionary[col]))
                        self.grid.place_agent(agent, (c, self.height - r - 1))
                        self.schedule.add(agent)
                        self.traffic_lights.append(agent)
                        
                        # Add road under traffic light
                        road_direction = self.determine_road_direction(r, c, lines)
                        if road_direction:
                            road = Road(f"r_{r*self.width+c}", self, road_direction)
                            self.grid.place_agent(road, (c, self.height - r - 1))

                    elif col == "#":
                        agent = Obstacle(f"ob_{r*self.width+c}", self)
                        self.grid.place_agent(agent, (c, self.height - r - 1))

                    elif col == "D":
                        agent = Destination(f"d_{r*self.width+c}", self)
                        self.grid.place_agent(agent, (c, self.height - r - 1))
                        self.destinations.append(agent)

        # Build intersection graph after placing all agents
        self.build_intersection_graph()

    def determine_road_direction(self, r, c, lines):
        """Determine road direction based on neighboring roads"""
        if r > 0 and lines[r-1][c] in ["V", "^"]:
            return "Up"
        elif r < len(lines)-1 and lines[r+1][c] in ["V", "^"]:
            return "Down"
        elif c > 0 and lines[r][c-1] in [">", "<"]:
            return "Right"
        elif c < len(lines[r])-1 and lines[r][c+1] in [">", "<"]:
            return "Left"
        return None

    def build_intersection_graph(self):
        """Build graph connecting traffic lights and destinations"""
        # Add nodes
        for content, (x, y) in self.grid.coord_iter():
            pos_tuple = (x, y)
            # Check if there's a traffic light or destination at this position
            for agent in content:
                if isinstance(agent, (Traffic_Light, Destination)):
                    self.intersection_graph.add_node(pos_tuple)
        
        # Connect nodes (only once)
        for pos1 in self.intersection_graph.nodes:
            for pos2 in self.intersection_graph.nodes:
                if pos1 != pos2:
                    path = self.find_road_path(pos1, pos2)
                    if path:
                        self.intersection_graph.add_edge(pos1, pos2, len(path))

    def find_road_path(self, start, end):
        """Find path between two points using only roads"""
        queue = [(start, [start])]
        visited = {start}
        
        while queue:
            current, path = queue.pop(0)
            if current == end:
                return path
            
            neighbors = self.grid.get_neighborhood(current, moore=False)
            for next_pos in neighbors:
                if next_pos not in visited:
                    cell_content = self.grid.get_cell_list_contents(next_pos)
                    if any(isinstance(agent, Road) for agent in cell_content):
                        visited.add(next_pos)
                        queue.append((next_pos, path + [next_pos]))
        return None

    def get_active_cars(self):
        """Return number of active cars"""
        return len([agent for agent in self.schedule.agents if isinstance(agent, Car)])

    def step(self):
        """Execute one step of the simulation"""
        cars_spawned = False
        # Spawn cars every 2 steps if possible
        if self.schedule.steps % 2 == 0 and self.destinations:
            corners = [
                (0, 0),                    # Bottom left
                (0, self.height-1),        # Top left
                (self.width-1, 0),         # Bottom right
                (self.width-1, self.height-1) # Top right
            ]
            
            for corner in corners:
                cell_contents = self.grid.get_cell_list_contents(corner)
                if (not any(isinstance(content, Car) for content in cell_contents) and
                    any(isinstance(content, Road) for content in cell_contents)):
                    destination = self.random.choice(self.destinations)
                    car = Car(f"car_{self.car_count}", self, destination)
                    self.grid.place_agent(car, corner)
                    self.schedule.add(car)
                    self.car_count += 1
                    cars_spawned = True

        # Continue if there are active cars or destinations
        active_cars = self.get_active_cars()
        if active_cars > 0 or self.destinations:
            self.total_episodes += 1
            self.datacollector.collect(self)
            self.schedule.step()
        else:
            self.running = False