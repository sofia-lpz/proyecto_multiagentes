import numpy as np
import matplotlib.pyplot as plt
from tqdm import tqdm

from scratch_model_q_learning import CityModel
from scratch_q_learning import *

class Train(CityModel):
    def __init__(self):
        super().__init__()

def train_model(episodes=100000, steps_per_episode=100, eval_interval=10):
    """
    Train the model for a specified number of episodes.
    
    Args:
        episodes: Number of training episodes
        steps_per_episode: Maximum steps per episode
        eval_interval: How often to evaluate performance
    """
    model = CityModel()
    
    training_rewards = []
    completion_rates = []
    
    for episode in tqdm(range(episodes), desc="Training"):
        episode_reward = 0
        cars_completed_start = model.cars_completed
        
        for step in range(steps_per_episode):
            model.step()

            for agent in model.schedule.agents:
                if isinstance(agent, Q_Car):
                    episode_reward += agent.get_reward(agent.pos)
            
            if not any(isinstance(agent, Q_Car) for agent in model.schedule.agents):
                break
        

        cars_completed_end = model.cars_completed
        cars_completed_episode = cars_completed_end - cars_completed_start
        completion_rate = cars_completed_episode / model.car_count if model.car_count > 0 else 0
        
        training_rewards.append(episode_reward)
        completion_rates.append(completion_rate)
        
        if episode % eval_interval == 0:
            avg_reward = np.mean(training_rewards[-eval_interval:])
            avg_completion = np.mean(completion_rates[-eval_interval:])
            print(f"\nEpisode {episode}")
            print(f"Average Reward: {avg_reward:.2f}")
            print(f"Completion Rate: {avg_completion:.2%}")
        
        q_tables = {}
        for agent in model.schedule.agents:
            if isinstance(agent, Q_Car):
                q_tables[agent.unique_id] = agent.q_table
                

        model.reset()

        for agent in model.schedule.agents:
            if isinstance(agent, Q_Car):
                if agent.unique_id in q_tables:
                    agent.q_table = q_tables[agent.unique_id]
    
    return model, training_rewards, completion_rates

def plot_training_results(training_rewards, completion_rates):
    """Plot training metrics"""
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 10))
    
    ax1.plot(training_rewards)
    ax1.set_title('Training Rewards over Episodes')
    ax1.set_xlabel('Episode')
    ax1.set_ylabel('Total Reward')
    
    ax2.plot(completion_rates)
    ax2.set_title('Completion Rate over Episodes')
    ax2.set_xlabel('Episode')
    ax2.set_ylabel('Completion Rate')
    
    plt.tight_layout()
    plt.show()

if __name__ == "__main__":
    trained_model, rewards, completions = train_model(
        episodes=100000,
        steps_per_episode=100,
        eval_interval=10
    )
    
    plot_training_results(rewards, completions)
    
    import pickle
    q_tables = {}
    for agent in trained_model.schedule.agents:
        if isinstance(agent, Q_Car):
            q_tables[agent.unique_id] = agent.q_table
            
    with open('q_tables.pkl', 'wb') as f:
        pickle.dump(q_tables, f)