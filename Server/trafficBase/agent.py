from mesa import Agent
from heapq import heappush, heappop

class Car(Agent):
    def __init__(self, unique_id, model, Destination):
        super().__init__(unique_id, model)
        self.destination = Destination
        self.timeStopped = 0
        self.pos = None
        self.route = None
        self.current_direction = None

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
    
    def manhattan_distance(self, pos1, pos2):
        return abs(pos1[0] - pos2[0]) + abs(pos1[1] - pos2[1])
    
    def get_road(self, pos):
        cell_contents = self.model.grid.get_cell_list_contents(pos)
        for content in cell_contents:
            if isinstance(content, Road):
                return content
        return None

    def can_turn(self, current_pos, next_pos):
        """
        Determine if a turn from current road to next road is valid.
        Always allows turns into roads with direction None.
        Args:
            current_pos: Current position tuple (x,y)
            next_pos: Next position tuple (x,y)
        Returns:
            bool: Whether the turn is valid
        """
        current_road = self.get_road(current_pos)
        next_road = self.get_road(next_pos)

        if not current_road or not next_road:
            return False

        # Always allow turns into roads with direction None
        if next_road.direction == "None":
            return True

        opposite_turns = {
            "Right": "Left",
            "Left": "Right",
            "Up": "Down",
            "Down": "Up"
        }

        required_direction = self.get_dir(current_pos, next_pos)

        return (next_road.direction != opposite_turns.get(required_direction) and 
                required_direction != opposite_turns.get(current_road.direction))
    
    def is_valid_move(self, current_pos, next_pos):
        next_road = self.get_road(next_pos)

        next_cell_contents = self.model.grid.get_cell_list_contents(next_pos)

        for content in next_cell_contents:
            if isinstance(content, Traffic_Light) and not content.state:
                return False
                
            if isinstance(content, (Car, Obstacle)):
                return False
        
        move_direction = self.get_dir(current_pos, next_pos)

        if move_direction == next_road.direction:
            return True
        
        return self.can_turn(current_pos, next_pos)

    def is_valid_cell(self, pos):
        cell_contents = self.model.grid.get_cell_list_contents(pos)
        for content in cell_contents:
            if isinstance(content, (Obstacle, Car)):
                return False
        return True
    
    def bfs_search_path(self, start, end):
        """
        Breadth-first search to find a path from start to end. Returns a list of positions that make up the path.
        """
        visited = set()
        queue = [[start]]
        
        while queue:
            path = queue.pop(0)
            node = path[-1]
            
            if node == end:
                return path
            
            if node in visited:
                continue
            
            visited.add(node)
            
            neighbors = self.model.grid.get_neighborhood(node, moore=False, include_center=False)
            
            for neighbor in neighbors:
                if self.is_valid_cell(neighbor):
                    new_path = list(path)
                    new_path.append(neighbor)
                    queue.append(new_path)
        
        return None
    
    def move(self):
        # Check if car has reached destination
        if self.pos == self.destination.pos:
            self.model.grid.remove_agent(self)
            self.model.schedule.remove(self)
            self.model.cars_completed += 1
            return
        
        # If no route is calculated or we need a new one
        if not self.route:
            self.route = self.bfs_search_path(self.pos, self.destination.pos)
            if not self.route:
                print("No valid path found")
                return
        
        next_pos = self.route[1]
        
        # Use self.pos instead of self.route[0] for current position
        if self.is_valid_move(self.pos, next_pos):
            self.current_direction = self.get_dir(self.pos, next_pos)
            self.model.grid.move_agent(self, next_pos)
            self.pos = next_pos
            self.route.pop(0)
            self.timeStopped = 0
        else:
            print("Invalid move")
            self.timeStopped += 1
            if self.timeStopped > 3:
                self.route = self.bfs_search_path(self.pos, self.destination.pos)
                self.timeStopped = 0     
    
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