from mesa import Agent
import numpy as np
import random

class Q_Car(Agent):
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
    def get_road(self, pos):
        """Get the road agent at a given position."""
        cell_contents = self.model.grid.get_cell_list_contents(pos)
        for content in cell_contents:
            if isinstance(content, Road):
                return content
        return None
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
    def is_valid_move(self, current_pos, next_pos):
        """
        Check if moving from current_pos to next_pos follows traffic rules.
        """
        current_road = self.get_road(current_pos)

        # Check if next_pos is a road
        next_road = self.get_road(next_pos)
        if not next_road:
            return False

        # Check traffic light
        cell_contents = self.model.grid.get_cell_list_contents(next_pos)
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
        if any(isinstance(content, (Q_Car,Obstacle)) for content in cell_contents):
            return False
        
        return True
    def get_neighbors(self, pos):
        """Get the neuman neighbors of a cell."""
        neighbors = []
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue
                new_pos = (pos[0] + dx, pos[1] + dy)
                if self.is_valid_cell(new_pos):
                    neighbors.append(self.model.grid.get_cell_list_contents(new_pos)[0])
        return neighbors
    
    def get_reward(self, next_pos):
        """Calculate reward for moving to next_pos"""
        if next_pos == self.destination.pos:
            return 100
            
        if not self.is_valid_cell(next_pos):
            return -5 
        
        if not self.is_valid_move(self.pos, next_pos):
            return -3  
            
        if next_pos == self.pos:
            return -1
            
        current_distance = abs(self.pos[0] - self.destination.pos[0]) + abs(self.pos[1] - self.destination.pos[1])
        new_distance = abs(next_pos[0] - self.destination.pos[0]) + abs(next_pos[1] - self.destination.pos[1])

        if new_distance < current_distance:
            return 2
        elif new_distance > current_distance:
            return -1
            
        return 0
    
    def get_state(self):
        """Get the current state of the agent for Q-learning.
        Returns an integer representing the state."""
        
        dest_x = self.destination.pos[0] - self.pos[0]
        dest_y = self.destination.pos[1] - self.pos[1]
        
        def discretize_position(pos):
            if pos < -10:
                return 0
            elif pos < 0:
                return 1
            elif pos == 0:
                return 2
            elif pos <= 10:
                return 3
            else:
                return 4
        
        x_bin = discretize_position(dest_x)
        y_bin = discretize_position(dest_y)
        
        neighbors = self.get_neighbors(self.pos)
        
        directions = [(0,1), (0,-1), (1,0), (-1,0)]  # Up, Down, Right, Left
        blocked = [0] * 4
        
        for neighbor in neighbors:
            if isinstance(neighbor, (Q_Car, Obstacle)):
                dx = neighbor.pos[0] - self.pos[0]
                dy = neighbor.pos[1] - self.pos[1]
                for i, (dir_x, dir_y) in enumerate(directions):
                    if dx == dir_x and dy == dir_y:
                        blocked[i] = 1
                        
            elif isinstance(neighbor, Traffic_Light):
                dx = neighbor.pos[0] - self.pos[0]
                dy = neighbor.pos[1] - self.pos[1]
                for i, (dir_x, dir_y) in enumerate(directions):
                    if dx == dir_x and dy == dir_y and not neighbor.state:
                        blocked[i] = 1
        
        blocked_state = sum(b << i for i, b in enumerate(blocked))

        state = x_bin * 80 + y_bin * 16 + blocked_state
        
        return state
        
    def __init__(self, unique_id, model, destination):
        super().__init__(unique_id, model)

        self.destination = destination

        self.possible_actions = [(0,1), (0,-1), (1,0), (-1,0)] 

        self.alpha = 0.1 
        self.gamma = 0.9
        self.epsilon = 1.0
        self.epsilon_decay = 0.995
        self.min_epsilon = 0.01

        observation_space_n = 400 
        self.q_table = np.zeros((observation_space_n, len(self.possible_actions)))

        self.state = None

    def choose_action(self, state):
        if random.uniform(0,1) < self.epsilon:
            valid_actions = []
            for i, action in enumerate(self.possible_actions):
                dx, dy = action
                next_pos = (self.pos[0] + dx, self.pos[1] + dy)
                if self.is_valid_cell(next_pos) and self.is_valid_move(self.pos, next_pos):
                    valid_actions.append(i)
            
            if valid_actions:
                return random.choice(valid_actions)
            return random.choice(range(len(self.possible_actions)))
        else:
            return np.argmax(self.q_table[state, :])

        
    def update_q_table(self, state, action, reward, next_state):
        old_value = self.q_table[state, action]
        next_max = np.max(self.q_table[next_state, :])

        self.q_table[state, action] = (1 - self.alpha) * old_value + self.alpha * (reward + self.gamma * next_max)

        self.state = next_state

    def move(self, action_idx):
        action = self.possible_actions[action_idx]
        dx, dy = action
        next_pos = (self.pos[0] + dx, self.pos[1] + dy)

        reward = self.get_reward(next_pos)

        if self.is_valid_cell(next_pos):
            self.model.grid.move_agent(self, next_pos)
            self.pos = next_pos

        return self.get_state(), reward

    def step(self):
        state = self.get_state()
        original_pos = self.pos  
        action = self.choose_action(state)
        next_state, reward = self.move(action)

        #print(f"Agent {self.unique_id} moved from {original_pos} to {self.pos} with reward {reward}")

        self.update_q_table(state, action, reward, next_state)
        self.epsilon = max(self.min_epsilon, self.epsilon * self.epsilon_decay)

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
    Destination agent. Where each Q_Car should go.
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


        
