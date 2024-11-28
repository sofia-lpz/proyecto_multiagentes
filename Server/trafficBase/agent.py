from mesa import Agent
from heapq import heappush, heappop

class Car(Agent):
    def get_dir(self, current_pos, next_pos):
        dx = next_pos[0] - current_pos[0]
        dy = next_pos[1] - current_pos[1]
        
        if dx > 0:
            return "Right"
        elif dx < 0:
            return "Left"
        elif dy > 0:
            return "Up"
        elif dy < 0:
            return "Down"
        return "None"

    def __init__(self, unique_id, model, Destination):
        super().__init__(unique_id, model)
        self.next_pos = None
        self.destination = Destination
        self.current_direction = None
        self.path = []
        self.current_road = None
        self.episodes_waiting = 0

    def manhattan_distance(self, pos1, pos2):
        """Calculate Manhattan distance between two points."""
        return abs(pos1[0] - pos2[0]) + abs(pos1[1] - pos2[1])

    def get_road(self, pos):
        """Get the road agent at a given position."""
        cell_contents = self.model.grid.get_cell_list_contents(pos)
        for content in cell_contents:
            if isinstance(content, Road):
                return content
        return None

    def is_valid_move(self, current_pos, next_pos, current_road=None, ignore_traffic_lights=False):
        """
        Check if moving from current_pos to next_pos follows traffic rules.
        """
        if not current_road:
            current_road = self.get_road(current_pos)
            if not current_road:
                return False

        next_road = self.get_road(next_pos)
        if not next_road:
            return False

        # Check traffic light
        cell_contents = self.model.grid.get_cell_list_contents(next_pos)
        if not ignore_traffic_lights:
            for content in cell_contents:
                if isinstance(content, Traffic_Light) and not content.state:
                    return False

        move_direction = self.get_dir(current_pos, next_pos)
        
        # Direct movement along road direction
        if move_direction == next_road.direction:
            return True
            
        # Check if turn is valid
        return self.can_turn(current_road, next_road)

    def is_valid_cell(self, pos):
        """Check if a cell is within the grid and not blocked by an obstacle."""
        if (pos[0] < 0 or pos[0] >= self.model.grid.width or 
            pos[1] < 0 or pos[1] >= self.model.grid.height):
            return False
        
        cell_contents = self.model.grid.get_cell_list_contents(pos)
        if any(isinstance(content, (Car,Obstacle)) for content in cell_contents):
            return False
        
        return True
    
    def find_path(self):
        """A* pathfinding implementation that uses the city's intersection graph."""
        start = self.pos
        goal = self.destination.pos
        
        # Get nearest intersections to start and goal
        start_intersection = self.find_nearest_intersection(start)
        goal_intersection = self.find_nearest_intersection(goal)
        
        if not start_intersection or not goal_intersection:
            # Fall back to original grid-based A* if not near intersections
            return self.find_path_grid()
        
        # Priority queue for open set
        open_set = []
        heappush(open_set, (0, start_intersection))
        
        # Path tracking
        came_from = {}
        g_score = {start_intersection: 0}
        f_score = {start_intersection: self.manhattan_distance(start_intersection, goal_intersection)}
        
        while open_set:
            current = heappop(open_set)[1]
            
            if current == goal_intersection:
                # Reconstruct high-level path through intersections
                path = []
                current_pos = current
                while current_pos in came_from:
                    path.append(current_pos)
                    current_pos = came_from[current_pos]
                path.append(start_intersection)
                path.reverse()
                
                # Convert intersection path to detailed grid path
                return self.convert_intersection_path_to_grid_path(start, path, goal)
            
            # Check all connected intersections
            for (node1, node2), weight in self.model.intersection_graph.edges.items():
                if node1 == self.model.intersection_graph.nodes[current]:
                    neighbor = next(pos for pos, nid in self.model.intersection_graph.nodes.items() if nid == node2)
                    tentative_g_score = g_score[current] + weight
                    
                    if neighbor not in g_score or tentative_g_score < g_score[neighbor]:
                        came_from[neighbor] = current
                        g_score[neighbor] = tentative_g_score
                        f_score_val = tentative_g_score + self.manhattan_distance(neighbor, goal_intersection)
                        heappush(open_set, (f_score_val, neighbor))
                elif node2 == self.model.intersection_graph.nodes[current]:
                    neighbor = next(pos for pos, nid in self.model.intersection_graph.nodes.items() if nid == node1)
                    tentative_g_score = g_score[current] + weight
                    
                    if neighbor not in g_score or tentative_g_score < g_score[neighbor]:
                        came_from[neighbor] = current
                        g_score[neighbor] = tentative_g_score
                        f_score_val = tentative_g_score + self.manhattan_distance(neighbor, goal_intersection)
                        heappush(open_set, (f_score_val, neighbor))
        
        # Fall back to grid-based A* if no path found through intersections
        return self.find_path_grid()

    def find_nearest_intersection(self, pos):
        """Find the nearest traffic light intersection to a given position."""
        nearest = None
        min_dist = float('inf')
        
        for intersection_pos in self.model.intersection_graph.nodes:
            dist = self.manhattan_distance(pos, intersection_pos)
            if dist < min_dist:
                min_dist = dist
                nearest = intersection_pos
        
        return nearest

    def convert_intersection_path_to_grid_path(self, start, intersection_path, goal):
        """Convert a path through intersections into a detailed grid path."""
        full_path = [start]
        
        # Connect start to first intersection
        if intersection_path:
            first_segment = self.find_path_between_points(start, intersection_path[0])
            if first_segment:
                full_path.extend(first_segment[1:])
        
        # Connect intersections
        for i in range(len(intersection_path) - 1):
            segment = self.find_path_between_points(intersection_path[i], intersection_path[i + 1])
            if segment:
                full_path.extend(segment[1:])
        
        # Connect last intersection to goal
        if intersection_path:
            last_segment = self.find_path_between_points(intersection_path[-1], goal)
            if last_segment:
                full_path.extend(last_segment[1:])
        
        return full_path

    def find_path_between_points(self, start, end):
        """Find a path between two points using grid-based A*."""
        # Implementation of original grid-based A* for local pathfinding
        # This should be your original find_path implementation renamed
        return self.find_path_grid()

    def find_path_grid(self):
        """Original grid-based A* implementation using Manhattan distance heuristic."""
        start = self.pos
        goal = self.destination.pos
        
        # Priority queue of positions to check, ordered by f_score
        open_set = []
        heappush(open_set, (0, start))
        
        # Keep track of where we came from for path reconstruction
        came_from = {}
        
        # Cost from start to current position
        g_score = {start: 0}
        
        # Estimated total cost from start to goal through current position
        f_score = {start: self.manhattan_distance(start, goal)}
        
        while open_set:
            current = heappop(open_set)[1]
            
            if current == goal:
                # Reconstruct path
                path = []
                while current in came_from:
                    path.append(current)
                    current = came_from[current]
                path.append(start)
                path.reverse()
                return path
                
            # Check all neighboring cells
            for next_pos in self.model.grid.get_neighborhood(
                current, moore=False, include_center=False):
                
                if not self.is_valid_cell(next_pos):
                    continue
                    
                # Get road at next position
                next_road = self.get_road(next_pos)
                if not next_road:
                    continue
                    
                # Check if move follows traffic rules (ignoring traffic lights for pathfinding)
                if not self.is_valid_move(current, next_pos, ignore_traffic_lights=True):
                    continue
                
                # Calculate tentative g_score
                tentative_g_score = g_score[current] + 1
                
                if next_pos not in g_score or tentative_g_score < g_score[next_pos]:
                    came_from[next_pos] = current
                    g_score[next_pos] = tentative_g_score
                    f_score_val = tentative_g_score + self.manhattan_distance(next_pos, goal)
                    heappush(open_set, (f_score_val, next_pos))
        
        return None  # No path found

    def can_turn(self, current_road, next_road):
        """
        Determine if a turn from current road to next road is valid.
        """
        opposite_turns = {
            "Right": "Left",
            "Left": "Right",
            "Up": "Down",
            "Down": "Up"
        }

        if next_road.direction == "None":
            return True
        
        required_direction = self.get_dir(current_road.pos, next_road.pos)
        direction_of_turned_road = next_road.direction

        return (direction_of_turned_road != opposite_turns.get(required_direction) and 
                required_direction != opposite_turns.get(current_road.direction))
    
    def move(self):
        if self.pos == self.destination.pos:
            self.model.grid.remove_agent(self)
            self.model.schedule.remove(self)
            self.model.cars_completed += 1
            return
        
        old_pos = self.pos

        # If we don't have a path or need to recalculate
        if not self.path:
            self.path = self.find_path()
            if not self.path:
                if self.pos == old_pos:
                    self.episodes_waiting += 1
                    if self.episodes_waiting >= 3:
                        print(f"Car {self.unique_id} is stuck at {self.pos}")
                else:
                    self.episodes_waiting = 0
                return  # No path found
            # Remove current position from path
            if self.path[0] == self.pos:
                self.path.pop(0)
        
        if self.path:
            self.next_pos = self.path[0]

            # Finally check if move is valid (including traffic lights)
            if self.is_valid_move(self.pos, self.next_pos) and self.is_valid_cell(self.next_pos):
                # Move if path is clear and traffic rules allow
                self.current_direction = self.get_dir(self.pos, self.next_pos)
                self.model.grid.move_agent(self, self.next_pos)
                self.path.pop(0)
            # If invalid due to traffic light, keep the same path and wait
            # The car will try again next step when the light might be green
            elif not self.is_valid_cell(self.next_pos):
                # Get current road direction
                current_road = self.get_road(self.pos)
                if not current_road:
                    return

                # Get perpendicular neighbors based on road direction
                if current_road.direction in ["Left", "Right"]:
                    neighbors = [(self.pos[0], self.pos[1] + 1), (self.pos[0], self.pos[1] - 1)]
                else:  # Up or Down
                    neighbors = [(self.pos[0] + 1, self.pos[1]), (self.pos[0] - 1, self.pos[1])]

                # Try each adjacent lane
                lane_changed = False
                for lane_pos in neighbors:
                    # Check if lane position is valid and has a road
                    if self.is_valid_cell(lane_pos) and self.get_road(lane_pos):
                        # Move to adjacent lane
                        self.model.grid.move_agent(self, lane_pos)
                        # Reset path to recalculate from new position
                        self.path = []
                        lane_changed = True
                        break

                # If lane change failed, try moving to a random valid neighbor
                if not lane_changed:
                    # Get all possible neighbors
                    all_neighbors = self.model.grid.get_neighborhood(
                        self.pos,
                        moore=True,
                        include_center=False
                    )
                    # Filter valid moves
                    valid_moves = [pos for pos in all_neighbors 
                                 if self.is_valid_cell(pos) and self.get_road(pos)]
                    
                    if valid_moves:
                        # Choose random valid position
                        new_pos = self.random.choice(valid_moves)
                        self.model.grid.move_agent(self, new_pos)
                        # Reset path from new position
                        self.path = []



    def step(self):
        self.move()

class Traffic_Light(Agent):
    """
    Traffic light. Where the traffic lights are in the grid.
    """
    def __init__(self, unique_id, model, state = False, timeToChange = 10):
        super().__init__(unique_id, model)
        """
        Creates a new Traffic light.
        Args:
            unique_id: The agent's ID
            model: Model reference for the agent
            state: Whether the traffic light is green or red
            timeToChange: After how many step should the traffic light change color 
        """
        self.state = state
        self.timeToChange = timeToChange

    def step(self):
        """ 
        To change the state (green or red) of the traffic light in case you consider the time to change of each traffic light.
        """
        if self.model.schedule.steps % self.timeToChange == 0:
            self.state = not self.state

class Destination(Agent):
    """
    Destination agent. Where each car should go.
    """
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)

    def step(self):
        pass

class Obstacle(Agent):
    """
    Obstacle agent. Just to add obstacles to the grid.
    """
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)

    def step(self):
        pass

class Road(Agent):
    """
    Road agent. Determines where the cars can move, and in which direction.
    """
    def __init__(self, unique_id, model, direction= "Left"):
        """
        Creates a new road.
        Args:
            unique_id: The agent's ID
            model: Model reference for the agent
            direction: Direction where the cars can move
        """
        super().__init__(unique_id, model)
        self.direction = direction

    def step(self):
        pass