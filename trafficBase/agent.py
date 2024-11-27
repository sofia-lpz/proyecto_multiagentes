from mesa import Agent

class Car(Agent):
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)
        self.next_pos = None

    def move(self):
        possible_steps = self.model.grid.get_neighborhood(
            self.pos,
            moore=False,
            include_center=False
        )
        
        valid_steps = []

        current_cell_contents = self.model.grid.get_cell_list_contents(self.pos)

        current_road = None
        for content in current_cell_contents:
            if isinstance(content, Road):
                current_road = content
                break

        for pos in possible_steps:
            # Skip if position is out of grid bounds
            if pos[0] < 0 or pos[1] < 0 or pos[0] >= self.model.grid.width or pos[1] >= self.model.grid.height:
                continue
                
            pos_cell_contents = self.model.grid.get_cell_list_contents(pos)

            road = None
            for content in pos_cell_contents:
                if isinstance(content, Road):
                    road = content
                    break
            
            if road:
                traffic_light = None
                for content in pos_cell_contents:
                    if isinstance(content, Traffic_Light):
                        traffic_light = content
                        break

                if traffic_light and not traffic_light.state:
                    print("Red light")
                    continue
                elif traffic_light and traffic_light.state:
                    print("Green light")
                    
                # Check direction matches movement
                # hypothetical direction of the car if pos is picked.
                dx = pos[0] - self.pos[0]
                dy = pos[1] - self.pos[1]
                
                if ((road.direction == "Right" and dx > 0) or
                    (road.direction == "Left" and dx < 0) or
                    (road.direction == "Up" and dy > 0) or
                    (road.direction == "Down" and dy < 0)):
                    valid_steps.append(pos)

        if valid_steps:
            self.next_pos = self.random.choice(valid_steps)
            
            # Get all agents in the next position
            next_pos_contents = self.model.grid.get_cell_list_contents(self.next_pos)
            
            # Check if there are no cars in the next position
            cars = [agent for agent in next_pos_contents if isinstance(agent, Car)]
            obstacles = [agent for agent in next_pos_contents if isinstance(agent, Obstacle)]
            if not cars and not obstacles:
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
