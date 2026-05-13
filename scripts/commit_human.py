import datetime
import random
import subprocess
import sys
import os
import argparse

def get_human_date(days_ago=None):
    today = datetime.datetime.now()
    if days_ago is not None:
        target_day = today - datetime.timedelta(days=days_ago)
        # If weekend, shift to previous Friday
        while target_day.weekday() >= 5:
            target_day -= datetime.timedelta(days=1)
        chosen_day = target_day
    else:
        valid_days = []
        # Look back 120 days
        for i in range(1, 121):
            day = today - datetime.timedelta(days=i)
            if day.weekday() < 5: # Monday to Friday
                if random.random() > 0.15: # Skip 15% of weekdays randomly
                    valid_days.append(day)
                    
        if not valid_days:
            valid_days.append(today)
            
        chosen_day = random.choice(valid_days)

    hour = random.randint(8, 18)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    
    fake_date = chosen_day.replace(hour=hour, minute=minute, second=second)
    return fake_date.strftime("%Y-%m-%dT%H:%M:%S")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Human commit time machine script")
    parser.add_argument("message", help="Commit message")
    parser.add_argument("--days-ago", type=int, default=None, help="Approximate days in the past")
    
    args = parser.parse_args()
    
    fake_date = get_human_date(args.days_ago)
    
    env = os.environ.copy()
    env["GIT_AUTHOR_DATE"] = fake_date
    env["GIT_COMMITTER_DATE"] = fake_date
    
    subprocess.run(["git", "add", "."], env=env)
    result = subprocess.run(["git", "commit", "-m", args.message], env=env, capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
