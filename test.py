import csv
import pygetwindow as gw
import time
import os
import logging
from datetime import datetime

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

def track_activity(output_file='activity_log.csv', interval=5):
    try:
        initialize_csv(output_file)
        logging.info(f"Activity tracking started. Output file: {output_file}")
        
        while True:
            try:
                active_window = get_active_window()
                if active_window:
                    write_to_csv(output_file, active_window)
                    print(f"Logged: {active_window}")
                time.sleep(interval)
            except IOError as e:
                logging.error(f"IO Error during tracking: {e}")
                print(f"An IO error occurred. Check the log file for details.")
            except Exception as e:
                logging.error(f"Unexpected error during tracking: {e}")
                print(f"An unexpected error occurred. Check the log file for details.")
    
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
