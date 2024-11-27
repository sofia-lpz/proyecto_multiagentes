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
        self.destination = Destination
        self.current_direction = None
        self.path = []
        self.current_road = None
        self.alternate_destination = None

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

    def is_valid_move(self, current_pos, next_pos, current_road=None):
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
        for content in cell_contents:
            if isinstance(content, Traffic_Light) and not content.state:
                return False

        move_direction = self.get_direction_from_coords(current_pos, next_pos)
        
        # Direct movement along road direction
        if move_direction == next_road.direction:
            return True
            
        # Check if turn is valid
        return self.can_turn(current_road, next_road)

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

    def get_valid_neighbors(self, pos):
        """Get valid neighboring positions around a given position."""
        neighbors = self.model.grid.get_neighborhood(
            pos,
            moore=True,  # Use von Neumann neighborhood
            include_center=False
        )
        valid_neighbors = []
        for neighbor in neighbors:
            if (neighbor[0] >= 0 and neighbor[0] < self.model.grid.width and 
                neighbor[1] >= 0 and neighbor[1] < self.model.grid.height):
                # Check if there's a road
                if self.get_road_at_pos(neighbor):
                    valid_neighbors.append(neighbor)
        return valid_neighbors

    def find_path(self):
        """A* pathfinding implementation that tries alternate destinations if main destination is blocked."""
        start = self.pos
        main_goal = self.destination.pos
        
        # First try direct path to destination
        path = self.a_star_search(start, main_goal)
        if path:
            self.alternate_destination = None
            return path
            
        # If no path found, try to find path to any valid neighbor of destination
        destination_neighbors = self.get_valid_neighbors(main_goal)
        
        # Sort neighbors by distance from current position
        destination_neighbors.sort(key=lambda x: self.manhattan_distance(start, x))
        
        for alt_goal in destination_neighbors:
            # Skip if neighbor is occupied
            cell_contents = self.model.grid.get_cell_list_contents(alt_goal)
            if any(isinstance(content, Obstacle) for content in cell_contents):
                continue
                
            path = self.a_star_search(start, alt_goal)
            if path:
                self.alternate_destination = alt_goal
                return path
                
        return None

    def a_star_search(self, start, goal):
        """A* pathfinding implementation."""
        open_set = []
        heappush(open_set, (0, start))
        
        came_from = {}
        g_score = {start: 0}
        f_score = {start: self.manhattan_distance(start, goal)}
        
        current_road = self.get_road_at_pos(start)
        if not current_road:
            return None

        while open_set:
            current = heappop(open_set)[1]
            
            if current == goal:
                path = []
                while current in came_from:
                    path.append(current)
                    current = came_from[current]
                path.append(start)
                path.reverse()
                return path
            
            neighbors = self.model.grid.get_neighborhood(
                current,
                moore=False,
                include_center=False
            )
            
            current_road = self.get_road_at_pos(current)
            if not current_road:
                continue

            for neighbor in neighbors:
                if (neighbor[0] < 0 or neighbor[0] >= self.model.grid.width or 
                    neighbor[1] < 0 or neighbor[1] >= self.model.grid.height):
                    continue

                if not self.is_valid_move(current, neighbor, current_road):
                    continue

                cell_contents = self.model.grid.get_cell_list_contents(neighbor)
                if any(isinstance(content, (Car, Obstacle)) for content in cell_contents):
                    continue

                tentative_g_score = g_score[current] + 1
                
                if neighbor not in g_score or tentative_g_score < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g_score
                    f_score[neighbor] = tentative_g_score + self.manhattan_distance(neighbor, goal)
                    heappush(open_set, (f_score[neighbor], neighbor))
        
        return None

    def move(self):
        # If at destination or alternate destination, remove the car
        if self.pos == self.destination.pos or (self.alternate_destination and self.pos == self.alternate_destination):
            self.model.grid.remove_agent(self)
            self.model.schedule.remove(self)
            return

        # If we don't have a path or need to recalculate
        if not self.path:
            self.path = self.find_path()
            if not self.path:
                return  # No path found
            # Remove current position from path
            if self.path[0] == self.pos:
                self.path.pop(0)
        
        if self.path:
            self.next_pos = self.path[0]
            
            # Verify move is still valid before executing
            if self.is_valid_move(self.pos, self.next_pos):
                next_pos_contents = self.model.grid.get_cell_list_contents(self.next_pos)
                
                # Check for cars and obstacles
                if not any(isinstance(content, (Car, Obstacle)) for content in next_pos_contents):
                    # Update current direction based on movement
                    self.current_direction = self.get_direction_from_coords(self.pos, self.next_pos)
                    self.model.grid.move_agent(self, self.next_pos)
                    self.path.pop(0)
                else:
                    # Recalculate path if blocked
                    self.path = self.find_path()
            else:
                # Recalculate path if move becomes invalid
                self.path = self.find_path()

    def step(self):
        self.move()

class Traffic_Light(Agent):
    def __init__(self, unique_id, model, state = False, timeToChange = 10, direction = "horizontal"):
        super().__init__(unique_id, model)
        self.state = state
        self.timeToChange = timeToChange
        self.direction = direction

    def get_neighbor_traffic_lights(self):
        """Get immediately adjacent traffic lights."""
        neighbors = []
        x, y = self.pos
        print(f"Traffic Light {self.unique_id} at ({x},{y}) direction:{self.direction} searching for neighbors")
        
        # Check all adjacent cells
        for dx, dy in [(0,1), (0,-1), (1,0), (-1,0)]:
            new_x, new_y = x + dx, y + dy
            if (0 <= new_x < self.model.grid.width and 
                0 <= new_y < self.model.grid.height):
                cell_contents = self.model.grid.get_cell_list_contents((new_x, new_y))
                for content in cell_contents:
                    if isinstance(content, Traffic_Light):
                        neighbors.append(content)
                        print(f"-> Found neighbor {content.unique_id} at ({new_x},{new_y}) direction:{content.direction}")
        
        if not neighbors:
            print(f"-> No neighbors found for light {self.unique_id}")
        return neighbors

    def get_opposite_traffic_lights(self):
        """Get traffic lights that should operate in opposition."""
        opposite_lights = set()
        x, y = self.pos
        print(f"\nFinding opposite lights for {self.unique_id} at ({x},{y}) direction:{self.direction}")
        
        # Check all 8 directions (Moore neighborhood)
        neighbors = []
        for dx, dy in [(0,1), (1,1), (1,0), (1,-1), (0,-1), (-1,-1), (-1,0), (-1,1)]:
            new_x, new_y = x + dx, y + dy
            if (0 <= new_x < self.model.grid.width and 
                0 <= new_y < self.model.grid.height):
                cell_contents = self.model.grid.get_cell_list_contents((new_x, new_y))
                for content in cell_contents:
                    if isinstance(content, Traffic_Light):
                        neighbors.append(content)
                        print(f"-> Found neighbor {content.unique_id} at ({new_x},{new_y}) direction:{content.direction}")
        
        print(f"-> Found {len(neighbors)} immediate neighbors")
        
        # For each neighbor
        for neighbor in neighbors:
            nx, ny = neighbor.pos
            # Only consider neighbors with same direction
            if neighbor.direction == self.direction:
                print(f"-> Checking neighbor {neighbor.unique_id} at ({nx},{ny}) with same direction")
                # Get their Moore neighbors
                for dx, dy in [(0,1), (1,1), (1,0), (1,-1), (0,-1), (-1,-1), (-1,0), (-1,1)]:
                    sx, sy = nx + dx, ny + dy
                    if (0 <= sx < self.model.grid.width and 
                        0 <= sy < self.model.grid.height):
                        cell_contents = self.model.grid.get_cell_list_contents((sx, sy))
                        for content in cell_contents:
                            if isinstance(content, Traffic_Light) and content.direction != self.direction:
                                print(f"--> Found opposite light {content.unique_id} at ({sx},{sy}) direction:{content.direction}")
                                opposite_lights.add(content)
        
        if not opposite_lights:
            print(f"-> No opposite lights found for {self.unique_id}")
        
        return list(opposite_lights)

    def step(self):
        self.get_neighbor_traffic_lights()
        self.get_opposite_traffic_lights()
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
