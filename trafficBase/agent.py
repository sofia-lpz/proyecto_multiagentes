from mesa import Agent

class Car(Agent):
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)
        self.next_pos = None
    
    def move(self):
        possible_steps = self.model.grid.get_neighborhood(
            self.pos,
            moore=False,  # Only consider von Neumann neighborhood
            include_center=False
        )
        
        # Filter for valid road cells
        valid_steps = []
        for pos in possible_steps:
            cell_contents = self.model.grid.get_cell_list_contents(pos)
            # Check for road and direction
            for content in cell_contents:
                if isinstance(content, Road):
                    if content.direction == "Right" and pos[0] > self.pos[0]:
                        valid_steps.append(pos)
                    elif content.direction == "Left" and pos[0] < self.pos[0]:
                        valid_steps.append(pos)
                    elif content.direction == "Up" and pos[1] > self.pos[1]:
                        valid_steps.append(pos)
                    elif content.direction == "Down" and pos[1] < self.pos[1]:
                        valid_steps.append(pos)
        
        if valid_steps:
            # Choose a random valid step
            self.next_pos = self.random.choice(valid_steps)
            
            # Check if next position is empty
            if self.model.grid.is_cell_empty(self.next_pos):
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
