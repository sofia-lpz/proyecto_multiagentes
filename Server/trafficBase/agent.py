from mesa import Agent

class Car(Agent):
    def calculate_distance(self, pos1, pos2):
        """
        Calculate Manhattan distance between two positions
        """
        return abs(pos1[0] - pos2[0]) + abs(pos1[1] - pos2[1])
    
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
        self.current_direction = None  # Track current direction of travel

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

        required_direction = self.get_direction_from_coords(self.pos, next_road.pos)
        direction_of_turned_road = next_road.direction

        is_valid = direction_of_turned_road != opposite_turns.get(required_direction) and required_direction != opposite_turns.get(current_road.direction)
        print(f"Turn is valid: {is_valid}")
        return is_valid

    def move(self):
        possible_steps = self.model.grid.get_neighborhood(
            self.pos,
            moore=False,
            include_center=False
        )
        
        valid_steps = []

        # Get current road
        current_cell_contents = self.model.grid.get_cell_list_contents(self.pos)
        current_road = None
        for content in current_cell_contents:
            if isinstance(content, Road):
                current_road = content
                break

        if not current_road:
            return

        for pos in possible_steps:
            # Skip if position is out of grid bounds
            if pos[0] < 0 or pos[1] < 0 or pos[0] >= self.model.grid.width or pos[1] >= self.model.grid.height:
                continue
                
            pos_cell_contents = self.model.grid.get_cell_list_contents(pos)

            next_road = None
            for content in pos_cell_contents:
                if isinstance(content, Road):
                    next_road = content
                    break
            
            if next_road:
                # Check traffic light
                traffic_light = None
                for content in pos_cell_contents:
                    if isinstance(content, Traffic_Light):
                        traffic_light = content
                        break

                if traffic_light and not traffic_light.state:
                    continue

                # Allow movement if:
                # 1. Direction matches the road direction, or
                # 2. It's a valid turn from current road to next road
                move_direction = self.get_direction_from_coords(self.pos, pos)
                
                if (move_direction == next_road.direction or 
                    self.can_turn(current_road, next_road)):
                    valid_steps.append(pos)

        # Print direction for each valid step
        for step in valid_steps:
            direction = self.get_direction_from_coords(self.pos, step)
            print(f"Position {step}: {direction}")

        if valid_steps:
            # TODO: Add logic to choose best step towards destination
            self.next_pos = self.random.choice(valid_steps)
            
            next_pos_contents = self.model.grid.get_cell_list_contents(self.next_pos)
            
            # Check for cars and obstacles
            cars = [agent for agent in next_pos_contents if isinstance(agent, Car)]
            obstacles = [agent for agent in next_pos_contents if isinstance(agent, Obstacle)]
            
            if not cars and not obstacles:
                # Update current direction based on movement
                self.current_direction = self.get_direction_from_coords(self.pos, self.next_pos)
                self.model.grid.move_agent(self, self.next_pos)

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
