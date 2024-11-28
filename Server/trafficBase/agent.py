from mesa import Agent
from heapq import heappush, heappop

class Car(Agent):
    def get_direction_from_coords(self, current_pos, next_pos):
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
        self.final_destination = Destination  # Store the original destination
        self.destination = Destination  # Current target (might be temporary)
        self.current_direction = None
        self.path = []
        self.current_road = None
        self.temp_destination = False  # Flag to track if we're using a temporary destination
        self.color = Destination.color 

    def manhattan_distance(self, pos1, pos2):
        """Calculate Manhattan distance between two points."""
        return abs(pos1[0] - pos2[0]) + abs(pos1[1] - pos2[1])

    def get_road_at_pos(self, pos):
        """Get the road agent at a given position."""
        cell_contents = self.model.grid.get_cell_list_contents(pos)
        for content in cell_contents:
            if isinstance(content, Road):
                return content
        return None

    def find_alternative_destination(self):
        """Find a nearby road cell to use as a temporary destination."""
        final_dest_pos = self.final_destination.pos
        neighborhood = self.model.grid.get_neighborhood(
            final_dest_pos,
            moore=True,  # Use Moore neighborhood (8 adjacent cells)
            include_center=False
        )
        
        best_alternative = None
        best_distance = float('inf')
        
        for pos in neighborhood:
            # Skip if out of bounds
            if (pos[0] < 0 or pos[0] >= self.model.grid.width or 
                pos[1] < 0 or pos[1] >= self.model.grid.height):
                continue
                
            cell_contents = self.model.grid.get_cell_list_contents(pos)
            road = None
            has_car = False
            
            for content in cell_contents:
                if isinstance(content, Road):
                    road = content
                elif isinstance(content, Car):
                    has_car = True
                    break
            
            # If we found a road without a car, consider it as an alternative
            if road and not has_car:
                distance = self.manhattan_distance(self.pos, pos)
                if distance < best_distance:
                    best_distance = distance
                    best_alternative = road
        
        return best_alternative

    def is_destination_blocked(self):
        """Check if the final destination is blocked by cars."""
        cell_contents = self.model.grid.get_cell_list_contents(self.final_destination.pos)
        return any(isinstance(content, Car) for content in cell_contents)

    def is_valid_move(self, current_pos, next_pos, current_road=None, ignore_traffic_lights=False):
        """
        Check if moving from current_pos to next_pos follows traffic rules.
        """
        if not current_road:
            current_road = self.get_road_at_pos(current_pos)
            if not current_road:
                return False

        next_road = self.get_road_at_pos(next_pos)
        if not next_road:
            return False

        # Check traffic light
        cell_contents = self.model.grid.get_cell_list_contents(next_pos)
        if not ignore_traffic_lights:
            for content in cell_contents:
                if isinstance(content, Traffic_Light) and not content.state:
                    return False

        move_direction = self.get_direction_from_coords(current_pos, next_pos)
        
        # Direct movement along road direction
        if move_direction == next_road.direction:
            return True
            
        # Check if turn is valid
        return self.can_turn(current_road, next_road)

    def find_path(self):
        """A* pathfinding implementation that respects traffic rules."""
        start = self.pos
        goal = self.destination.pos
        
        # Priority queue for open set
        open_set = []
        heappush(open_set, (0, start))
        
        # Dictionary to store path
        came_from = {}
        
        # Cost to reach each node
        g_score = {start: 0}
        
        # Estimated total cost
        f_score = {start: self.manhattan_distance(start, goal)}
        
        # Get initial road
        current_road = self.get_road_at_pos(start)
        if not current_road:
            return None

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
            
            # Get neighbors (possible next positions)
            neighbors = self.model.grid.get_neighborhood(
                current,
                moore=False,
                include_center=False
            )
            
            current_road = self.get_road_at_pos(current)
            if not current_road:
                continue

            for neighbor in neighbors:
                # Skip if out of bounds
                if (neighbor[0] < 0 or neighbor[0] >= self.model.grid.width or 
                    neighbor[1] < 0 or neighbor[1] >= self.model.grid.height):
                    continue

                # Check if move follows traffic rules
                if not self.is_valid_move(current, neighbor, current_road, True):
                    continue

                # Check for obstacles and other cars
                cell_contents = self.model.grid.get_cell_list_contents(neighbor)
                if any(isinstance(content, Obstacle) for content in cell_contents):
                    continue

                # Calculate scores
                tentative_g_score = g_score[current] + 1
                
                if neighbor not in g_score or tentative_g_score < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g_score
                    f_score[neighbor] = tentative_g_score + self.manhattan_distance(neighbor, goal)
                    heappush(open_set, (f_score[neighbor], neighbor))
        
        return None

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

        required_direction = self.get_direction_from_coords(current_road.pos, next_road.pos)
        direction_of_turned_road = next_road.direction

        return (direction_of_turned_road != opposite_turns.get(required_direction) and 
                required_direction != opposite_turns.get(current_road.direction))
    
    def move(self):
        # If we've reached the final destination
        if self.pos == self.final_destination.pos:
            self.model.grid.remove_agent(self)
            self.model.schedule.remove(self)
            self.model.cars_completed += 1
            return

        # If we're at a temporary destination, check if final destination is now available
        if self.temp_destination and self.pos == self.destination.pos:
            if not self.is_destination_blocked():
                self.destination = self.final_destination
                self.temp_destination = False
                self.path = []  # Force path recalculation
            else:
                # Find another temporary destination if needed
                alt_dest = self.find_alternative_destination()
                if alt_dest:
                    self.destination = alt_dest
                    self.path = []  # Force path recalculation

        # If we don't have a path or need to recalculate
        if not self.path:
            # If final destination is blocked and we're not already using a temporary destination
            if not self.temp_destination and self.is_destination_blocked():
                alt_dest = self.find_alternative_destination()
                if alt_dest:
                    self.destination = alt_dest
                    self.temp_destination = True
            
            self.path = self.find_path()
            if not self.path:
                return  # No path found
            # Remove current position from path
            if self.path[0] == self.pos:
                self.path.pop(0)
        
        if self.path:
            self.next_pos = self.path[0]
            
            # First check for permanent obstacles
            next_pos_contents = self.model.grid.get_cell_list_contents(self.next_pos)
            if any(isinstance(content, Obstacle) for content in next_pos_contents):
                # Recalculate path if blocked by obstacle
                self.path = self.find_path()
                return
                
            # Then check for cars - just wait if blocked by car
            if any(isinstance(content, Car) for content in next_pos_contents):
                # Keep the same path but wait
                return

            # Finally check if move is valid (including traffic lights)
            if self.is_valid_move(self.pos, self.next_pos):
                # Move if path is clear and traffic rules allow
                self.current_direction = self.get_direction_from_coords(self.pos, self.next_pos)
                self.model.grid.move_agent(self, self.next_pos)
                self.path.pop(0)
            # If invalid due to traffic light, keep the same path and wait
            # The car will try again next step when the light might be green

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
        #pick a random color from a list of 17 colors
        self.color = self.random.choice(["red", "blue", "green", "yellow", "purple", "orange", "pink", "brown", "black", "white", "gray", "cyan", "magenta", "olive", "maroon", "navy", "teal"])

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