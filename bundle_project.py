import os

# Define folders to completely ignore (to keep the output file small and clean)
IGNORE_FOLDERS = {
    'node_modules', 'dist', 'build', '.git', '.next', '.cache', 
    'venv', 'env', '__pycache__', 'out', 'target'
}

# Define file extensions to include in the context
INCLUDE_EXTENSIONS = {
    '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', 
    '.py', '.md', '.yml', '.yaml', '.toml'
}

# Define specific files to ignore even if they match extensions
IGNORE_FILES = {
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'
}

def bundle_project(directory_path, output_file_path):
    print(f"Scanning directory: {directory_path}...")
    file_count = 0
    
    with open(output_file_path, 'w', encoding='utf-8') as outfile:
        # Write project structure header
        outfile.write("==================================================\n")
        outfile.write("PROJECT BUNDLE FOR CONTEXT\n")
        outfile.write("==================================================\n\n")
        
        # Traverse directory
        for root, dirs, files in os.walk(directory_path):
            # Modify dirs in-place to skip ignored folders
            dirs[:] = [d for d in dirs if d not in IGNORE_FOLDERS]
            
            for file in files:
                if file in IGNORE_FILES:
                    continue
                    
                file_extension = os.path.splitext(file)[1].lower()
                if file_extension in INCLUDE_EXTENSIONS:
                    full_path = os.path.join(root, file)
                    relative_path = os.path.relpath(full_path, directory_path)
                    
                    try:
                        with open(full_path, 'r', encoding='utf-8', errors='ignore') as infile:
                            content = infile.read()
                            
                        # Format each file clearly for the LLM context
                        outfile.write(f"--- START FILE: {relative_path} ---\n")
                        outfile.write(content)
                        outfile.write(f"\n--- END FILE: {relative_path} ---\n\n")
                        file_count += 1
                        print(f"Bundled: {relative_path}")
                    except Exception as e:
                        print(f"Error reading {relative_path}: {e}")
                        
    print(f"\nSuccess! Combined {file_count} files into '{output_file_path}'")
    print("You can now upload 'project_context_bundle.txt' straight to the chat.")

if __name__ == "__main__":
    # Get current working directory as default
    current_dir = os.getcwd()
    output_name = "project_context_bundle.txt"
    bundle_project(current_dir, output_name)
