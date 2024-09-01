import csv
import pygetwindow as gw
import time
import os
import logging
from datetime import datetime, timedelta

logging.basicConfig(filename='activity_tracker.log', level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')

def get_active_window():
    try:
        window = gw.getActiveWindow()
        if window:
            return {
                "timestamp": datetime.now().isoformat(),
                "title": window.title,
                "process_id": window._hWnd
            }
        return None
    except Exception as e:
        logging.error(f"Error retrieving active window: {e}")
        return None

def initialize_csv(output_file):
    if not os.path.isfile(output_file):
        try:
            with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = ['timestamp', 'title', 'process_id']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
        except IOError as e:
            logging.error(f"Error creating CSV file: {e}")
            raise

def write_to_csv(output_file, data):
    try:
        with open(output_file, 'a', newline='', encoding='utf-8') as csvfile:
            fieldnames = ['timestamp', 'title', 'process_id']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writerow(data)
    except IOError as e:
        logging.error(f"Error writing to CSV file: {e}")
        raise

def track_activity(output_file='activity_log.csv', interval=1, idle_time=300, grace_period=60):
    last_active_window = None
    last_active_time = datetime.now()
    is_idle = False
    idle_start_time = None
    
    try:
        initialize_csv(output_file)
        logging.info(f"Activity tracking started. Output file: {output_file}")
        
        while True:
            current_window = get_active_window()
            if current_window:
                if last_active_window != current_window['title'] or not last_active_window:
                    if is_idle:
                        idle_duration = (datetime.now() - idle_start_time).total_seconds()
                        if idle_duration >= grace_period:
                            logging.info(f"Idle period ended. Duration: {idle_duration} seconds.")
                            print(f"Idle period ended. Duration: {idle_duration} seconds.")
                        is_idle = False
                    last_active_window = current_window['title']
                    last_active_time = datetime.now()
                    write_to_csv(output_file, current_window)
                    print(f"Logged: {current_window}")
                elif (datetime.now() - last_active_time).total_seconds() > idle_time and not is_idle:
                    is_idle = True
                    idle_start_time = datetime.now()
                    logging.info(f"System became idle.")
                    print(f"System became idle.")
            time.sleep(interval)
    except KeyboardInterrupt:
        logging.info("Activity tracking stopped by user.")
        print("\nActivity tracking stopped.")
    except Exception as e:
        logging.critical(f"Critical error in track_activity: {e}")
        print(f"A critical error occurred. Check the log file for details.")

if __name__ == "__main__":
    try:
        track_activity()
    except Exception as e:
        logging.critical(f"Unexpected error in main execution: {e}")
        print(f"An unexpected error occurred. Check the log file for details.")
