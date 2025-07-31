#!/usr/bin/env python3
"""
Trajectory Converter Script

Converts trajectory JSON from the tool's output format to a new structured format.

Usage:
    python convert_trajectory.py <input_json> <output_path>
"""

import json
import re
import sys
import argparse
from pathlib import Path


def extract_problem_from_content(content):
    """
    Extract the problem description from content using regex.
    Looks for text between <pr_description> and </pr_description> tags.
    """
    if not content:
        return None
    
    # Handle both string and object content
    text = content
    if isinstance(content, dict) and 'text' in content:
        text = content['text']
    elif isinstance(content, list) and len(content) > 0 and isinstance(content[0], dict) and 'text' in content[0]:
        text = content[0]['text']
    
    if not isinstance(text, str):
        return None
    
    # Extract text between <pr_description> and </pr_description>
    match = re.search(r'<pr_description>(.*?)</pr_description>', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    return None


def extract_errors_from_output(output_text):
    """
    Extract error lines from command output using pattern matching.
    Returns a list of error lines.
    """
    if not output_text:
        return []
    
    # Common patterns to look for
    error_patterns = [
        r"\b(?:\w+):\d+:\d+: error: .*",  # e.g., gcc-style errors (more specific pattern first)
        r"\b(failed|exception|undefined|denied)\b",  # specific error keywords
        r"\berror\b.*?(?::|;|$)",  # "error" followed by colon, semicolon, or end of line
        r"(?:command|process|operation|task)\s+(?:failed|error)",  # contextual errors
        r"(?:permission|access)\s+denied",  # permission errors
        r"(?:file|directory|path).*(?:not found|does not exist)",  # file not found errors
    ]
    
    # Patterns to exclude (false positives)
    exclude_patterns = [
        r"^[/\\].*[/\\].*(?:error|fail|exception)",  # file/directory paths containing error words
        r"\w*(?:error|fail|exception)\w*\.(py|js|java|cpp|c|h|txt|log|md)$",  # filenames with error words
        r"^\s*[\w/\\.-]*(?:error|fail|exception)[\w/\\.-]*\s*$",  # standalone paths/filenames
    ]
    
    # Scan line by line
    error_lines = []
    for line in output_text.splitlines():
        line_stripped = line.strip()
        
        # Skip if line matches exclude patterns
        is_excluded = False
        for exclude_pattern in exclude_patterns:
            if re.search(exclude_pattern, line_stripped, re.IGNORECASE):
                is_excluded = True
                break
        
        if is_excluded:
            continue
            
        # Check for error patterns
        for pattern in error_patterns:
            if re.search(pattern, line_stripped, re.IGNORECASE):
                error_lines.append(line_stripped)
                break  # avoid duplicate matching
    
    return error_lines


def clean_openfile_observation(observation_text):
    """
    Clean openFile observation by removing the clipped response ending.
    """
    if not observation_text:
        return observation_text
    
    # Define the ending text to remove
    clipped_ending = '<response clipped><NOTE>To save on context only part of this file has been shown to you. You should retry this tool after you have searched inside the file with `grep -n` in order to find the line numbers of what you are looking for.</NOTE>\n<IMPORTANT><NOTE>The above file has been abbreviated. Please use `str_replace editor view` with `view_range` to look at relevant files in detail.</NOTE></IMPORTANT>'
    
    # Remove the ending if it exists
    if clipped_ending in observation_text:
        return observation_text.replace(clipped_ending, '').rstrip()
    
    return observation_text


def extract_workspace_from_observation(observation_text, file_path=None):
    """
    Extract workspace from observation text starting from the first newline.
    Returns the workspace string wrapped in XML tags with file path and content markers.
    """
    if not observation_text:
        if file_path:
            return f"<workspace>\n{file_path}\n=========FILE CONTENT=======\n\n=========FILE CONTENT=======\n</workspace>"
        return "<workspace>\n\n=========FILE CONTENT=======\n\n=========FILE CONTENT=======\n</workspace>"
    
    # Find the first newline and return everything from that newline onwards (including the \n)
    newline_index = observation_text.find('\n')
    if newline_index != -1:
        workspace_content = observation_text[newline_index:]
        if file_path:
            return f"<workspace>\n{file_path}\n=========FILE CONTENT======={workspace_content}\n=========FILE CONTENT=======\n</workspace>"
        else:
            return f"<workspace>\n\n=========FILE CONTENT======={workspace_content}\n=========FILE CONTENT=======\n</workspace>"
    else:
        # If no newline found, use the whole observation as content
        if file_path:
            return f"<workspace>\n{file_path}\n=========FILE CONTENT=======\n{observation_text}\n=========FILE CONTENT=======\n</workspace>"
        else:
            return f"<workspace>\n\n=========FILE CONTENT=======\n{observation_text}\n=========FILE CONTENT=======\n</workspace>"


def get_workspace_from_action(action):
    """
    Extract workspace from action output if it exists.
    Returns the workspace string or None if action doesn't have workspace output.
    """
    if isinstance(action, dict) and "output" in action and isinstance(action["output"], dict):
        return action["output"].get("workspace")
    return None


def parse_action(action_text, observation_text):
    """
    Parse action text and observation to create action objects.
    Returns a list of action objects.
    """
    if not action_text:
        return ["<actions>"]  # Placeholder for empty actions
    
    # Handle submit action
    if action_text.strip() == "submit":
        return [{
            "name": "endInteraction",
            "input": {
                "answer": observation_text if observation_text else ""
            },
            "output": None,
            "metadata": {}
        }]
    
    # Handle str_replace_editor create <path> --file_text <content> pattern
    create_match = re.search(
        r"str_replace_editor\s+create\s+(.+?)\s+--file_text\s+(.+)",
        action_text.strip(),
        flags=re.DOTALL
    )
    if create_match:
        file_path = create_match.group(1).strip()
        file_content = create_match.group(2).strip()
        
        return [{
            "name": "createFile",
            "input": {
                "file_path": file_path,
                "file_content": file_content
            },
            "output": {
                "workspace": f"<workspace>\n/testbed/reproduce.py\n=========FILE CONTENT=======\n{file_content}\n=========FILE CONTENT=======\n</workspace>"
            },
            "metadata": {}
        }]
    
    # Handle str_replace_editor str_replace <path> --old_str <old> --new_str <new> pattern
    str_replace_match = re.search(
        r"str_replace_editor\s+str_replace\s+(.+?)\s+--old_str\s+(.+?)\s+--new_str\s+(.+)",
        action_text.strip(),
        flags=re.DOTALL
    )

    if str_replace_match:
        file_path = str_replace_match.group(1).strip()
        old_string = str_replace_match.group(2).strip()
        new_string = str_replace_match.group(3).strip()
        
        # Extract line numbers from observation
        replace_start_line = None
        replace_end_line = None
        
        if observation_text:
            # Find all line numbers in the format "\n  <integer>"
            line_numbers = []
            for match in re.finditer(r'\n\s*(\d+)', observation_text):
                line_numbers.append(int(match.group(1)))
            
            if line_numbers:
                replace_start_line = min(line_numbers) + 4
                replace_end_line = max(line_numbers) - 4
        
        # Clean the observation text by removing the review message ending
        cleaned_observation = observation_text
        if observation_text:
            review_ending = "\nReview the changes and make sure they are as expected. Edit the file again if necessary.\n"
            if review_ending in observation_text:
                cleaned_observation = observation_text.replace(review_ending, "").rstrip()
        
        return [{
            "name": "replaceCodeString",
            "input": {
                "file_path": file_path,
                "find": old_string,
                "replace": new_string,
                "replace_start_line": replace_start_line,
                "replace_end_line": replace_end_line
            },
            "output": {
                "workspace": extract_workspace_from_observation(cleaned_observation, file_path)
            },
            "metadata": {}
        }]
    
    # Handle str_replace_editor view <path> --view_range <start> <end> pattern
    view_range_match = re.match(r'str_replace_editor\s+view\s+(.+?)\s+--view_range\s+(\d+)\s+(\d+)', action_text.strip())
    if view_range_match:
        file_path = view_range_match.group(1).strip()
        start_range = int(view_range_match.group(2))
        end_range = int(view_range_match.group(3))
        
        return [{
            "name": "selectCodeBlock",
            "input": {
                "file_path": file_path,
                "line_ranges": [
                    [start_range, end_range]
                ]
            },
            "output": {
                "workspace": extract_workspace_from_observation(observation_text, file_path)
            },
            "metadata": {}
        }]
    
    # Handle str_replace_editor view <path> pattern (could be file or directory)
    view_match = re.match(r'str_replace_editor\s+view\s+(.+)', action_text.strip())
    if view_match:
        path = view_match.group(1).strip()
        
        # Check if observation contains the directory listing pattern
        expected_pattern = "Here's the files and directories up to 2 levels deep in /testbed, excluding hidden items:"
        if observation_text and expected_pattern in observation_text:
            # This is a directory listing - convert to executeCmd
            pattern_index = observation_text.find(expected_pattern)
            stdout_content = observation_text[pattern_index + len(expected_pattern):].strip()
            
            # Extract errors from the observation
            errors = extract_errors_from_output(observation_text)
            
            return [{
                "name": "executeCmd",
                "input": {
                    "cmd": f"find {path} -maxdepth 2 -not -path '*/\\.*'"
                },
                "output": {
                    "stdout": stdout_content
                },
                "metadata": {}
            }]
        else:
            # This is a file view without range - convert to openFile
            # Clean the observation text by removing the clipped response ending
            cleaned_observation = clean_openfile_observation(observation_text)
            
            return [{
                "name": "openFile",
                "input": {
                    "file_path": path
                },
                "output": {
                    "workspace": extract_workspace_from_observation(cleaned_observation, path)
                },
                "metadata": {}
            }]
    
    # Default: convert all other actions to executeCmd
    return [{
        "name": "executeCmd",
        "input": {
            "cmd": action_text
        },
        "output": {
            "stdout": observation_text if observation_text else ""
        },
        "metadata": {}
    }]


def convert_trajectory(input_data):
    """
    Convert trajectory data from tool format to new format.
    """
    result = []
    
    # Initialize stateful workspace metadata
    current_workspace_metadata = "<workspace>\n</workspace>"
    
    # Find Step 0 (first message), regular trajectory steps, and clustered steps
    step_zero = None
    trajectory_steps = []
    clustered_steps = []
    
    for item in input_data:
        if isinstance(item, dict):
            if item.get('isStepZero'):
                step_zero = item
            elif item.get('clustered') == True:
                clustered_steps.append(item)
            elif item.get('clustered') == False:
                trajectory_steps.append(item)
    
    # Sort trajectory steps by originalIndex to maintain order
    trajectory_steps.sort(key=lambda x: x.get('originalIndex', 0))
    clustered_steps.sort(key=lambda x: x.get('originalIndex', 0))
    
    # Create the first entry from Step 0
    if step_zero:
        repo = step_zero.get('repo', 'unknown/unknown')
        content = step_zero.get('content', '')
        problem = extract_problem_from_content(content)
        
        # Get the last observation for patch metadata
        last_observation = None
        if trajectory_steps:
            last_step = max(trajectory_steps, key=lambda x: x.get('originalIndex', 0))
            last_observation = last_step.get('observation', 'No observation available')
        
        first_entry = {
            "id": 0,
            "parent": None,
            "actions": [
                {
                    "name": "beginInteraction",
                    "input": {},
                    "output": {
                        "user_prompt": content,
                        "repo": repo,
                        "problem": problem
                    },
                    "metadata": {}
                }
            ],
            "thought": None,
            "metadata": {
                "patch": last_observation,
                "hints_text": "NA",
                "stage": "MAIN"
            }
        }
        result.append(first_entry)
    
    # Combine and sort all steps (trajectory + clustered) by originalIndex
    all_steps = trajectory_steps + clustered_steps
    all_steps.sort(key=lambda x: x.get('originalIndex', 0))
    
    # Convert all steps
    for step in all_steps:
        # Skip if this is Step 0 (shouldn't happen but safety check)
        if step.get('isStepZero'):
            continue
            
        entry_id = len(result)  # Continue numbering from where we left off
        parent_id = entry_id - 1 if entry_id > 0 else None
        
        # Handle clustered steps
        if step.get('clustered') == True:
            # For clustered steps, process each sub-step
            sub_steps = step.get('steps', [])
            actions = step.get('actions', [])
            observations = step.get('observations', [])
            
            # Create actions from the clustered data
            parsed_actions = []
            for i, action in enumerate(actions):
                observation = observations[i] if i < len(observations) else ''
                parsed_actions.extend(parse_action(action, observation))
            
            # Update workspace metadata from the last action that has workspace output
            for action in reversed(parsed_actions):
                workspace = get_workspace_from_action(action)
                if workspace:
                    current_workspace_metadata = workspace
                    break
            
            entry = {
                "id": entry_id,
                "parent": parent_id,
                "actions": parsed_actions,
                "thought": step.get('thought', step.get('summary', '')),
                "metadata": {
                    "workspace": current_workspace_metadata,
                    "stage": "TESTING"
                }
            }
        else:
            # Handle regular trajectory steps
            action_text = step.get('action', '')
            observation_text = step.get('observation', '')
            parsed_actions = parse_action(action_text, observation_text)
            
            # Update workspace metadata from any action that has workspace output
            for action in parsed_actions:
                workspace = get_workspace_from_action(action)
                if workspace:
                    current_workspace_metadata = workspace
                    break  # Use the first (and typically only) action's workspace
            
            entry = {
                "id": entry_id,
                "parent": parent_id,
                "actions": parsed_actions,
                "thought": step.get('thought', ''),
                "metadata": {
                    "workspace": current_workspace_metadata,
                    "stage": "TESTING"
                }
            }
        
        result.append(entry)
    
    return result


def main():
    parser = argparse.ArgumentParser(description='Convert trajectory JSON format')
    parser.add_argument('input_json', help='Path to input JSON file')
    parser.add_argument('output_path', help='Path for output JSON file')
    
    args = parser.parse_args()
    
    # Read input file
    try:
        with open(args.input_json, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Input file '{args.input_json}' not found.")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in input file: {e}")
        sys.exit(1)
    
    # Convert the data
    try:
        converted_data = convert_trajectory(input_data)
    except Exception as e:
        print(f"Error during conversion: {e}")
        sys.exit(1)
    
    # Write output file
    try:
        output_path = Path(args.output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(converted_data, f, indent=2, ensure_ascii=False)
        
        print(f"Conversion successful! Output saved to: {args.output_path}")
        print(f"Converted {len(converted_data)} entries.")
        
    except Exception as e:
        print(f"Error writing output file: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main() 