from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from agent import *
import json
from mesa.datacollection import DataCollector

class IntersectionGraph:
    def __init__(self, model):
        self.nodes = {}  # (x,y) -> node_id mapping
        self.edges = {}  # (node1,node2) -> weight
        self.build_graph(model)
    
    def build_graph(self, model):
        # Identify intersections (nodes) - places with traffic lights
        node_id = 0
        for traffic_light in model.traffic_lights:
            x, y = traffic_light.pos
            self.nodes[(x, y)] = node_id
            node_id += 1
        
        # Find paths between intersections
        for start_pos, start_node in self.nodes.items():
            visited = set([start_pos])
            queue = [(start_pos, 0)]
            
            while queue:
                current_pos, distance = queue.pop(0)
                x, y = current_pos
                
                # Check all neighbors
                for next_pos in [(x+1,y), (x-1,y), (x,y+1), (x,y-1)]:
                    if next_pos in visited:
                        continue
                        
                    # Check if position is valid
                    if (next_pos[0] < 0 or next_pos[0] >= model.grid.width or 
                        next_pos[1] < 0 or next_pos[1] >= model.grid.height):
                        continue
                    
                    # Get cell contents
                    cell_contents = model.grid.get_cell_list_contents(next_pos)
                    
                    # Skip if obstacle or no road
                    if any(isinstance(content, Obstacle) for content in cell_contents) or \
                       not any(isinstance(content, Road) for content in cell_contents):
                        continue
                    
                    # If we found another intersection
                    if next_pos in self.nodes:
                        end_node = self.nodes[next_pos]
                        if start_node != end_node:
                            edge = tuple(sorted([start_node, end_node]))
                            self.edges[edge] = min(distance + 1, 
                                                 self.edges.get(edge, float('inf')))
                        continue
                    
                    visited.add(next_pos)
                    queue.append((next_pos, distance + 1))

class CityModel(Model):

    def print_weighted_graph(self):
        """Prints the weighted graph representation of intersections and their connections."""
        print("\nWeighted Graph of Traffic Intersections:")
        print("----------------------------------------")
        
        # Print nodes with their coordinates
        print("Nodes (Traffic Lights):")
        node_to_pos = {v: k for k, v in self.intersection_graph.nodes.items()}
        for node_id, pos in node_to_pos.items():
            print(f"Node {node_id}: Position {pos}")
        
        # Print edges with weights
        print("\nEdges (Connections between intersections):")
        for (node1, node2), weight in self.intersection_graph.edges.items():
            pos1 = node_to_pos[node1]
            pos2 = node_to_pos[node2]
            print(f"Node {node1} ({pos1}) <-> Node {node2} ({pos2}): Distance = {weight}")

    def __init__(self, N):
        with open('./city_files/mapDictionary.json') as mapDictionary:
            dataDictionary = json.load(mapDictionary)
            
        self.traffic_lights = []
        self.car_count = 0
        self.cars_completed = 0
        self.destinations = []
        self.total_episodes = 0

        self.datacollector = DataCollector(
            model_reporters={
                "Active Cars": lambda m: len([a for a in m.schedule.agents if isinstance(a, Car)]),
                "Completed Cars": lambda m: m.cars_completed,
                "Average Completed Cars": lambda m: m.cars_completed / m.total_episodes
            }
        )
        
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
                        
                        road = Road(f"r_{r*self.width+c}", self, "None")
                        self.grid.place_agent(road, (c, self.height - r - 1))


        self.intersection_graph = IntersectionGraph(self)

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
        """
        destination = self.random.choice(self.destinations)
        car0 = Car(f"car_{self.car_count}", self, destination)
        self.grid.place_agent(car0, (0, 0))
        self.schedule.add(car0)
        self.car_count += 1
        """
        
            
    def step(self):
        cars_spawned = False
        # Spawn cars every 2 steps
        if self.schedule.steps % 2 == 0 and self.destinations:
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
                    cars_spawned = True

        # stop if cars are not spawned when they should, every two steps
        if not cars_spawned and self.schedule.steps % 2 == 0:
            self.running = False
            return
        
        self.total_episodes += 1
        self.datacollector.collect(self)  # Collect data
        self.schedule.step()