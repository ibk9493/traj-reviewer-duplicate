import React, { useState, useEffect } from 'react';
import './App.css';
import Chat from './Chat';
import ClusterControls from './components/ClusterControls';
import ClusteredStep from './components/ClusteredStep';
import { downloadJSON } from './utils/download';
import { highlightMatches } from './utils/highlight';

function App() {
  const [trajectory, setTrajectory] = useState([]);
  const [filteredTrajectory, setFilteredTrajectory] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fileName, setFileName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [semanticFilter, setSemanticFilter] = useState(null);
  const [chatKey, setChatKey] = useState(0);
  const [fileContent, setFileContent] = useState('');
  const [modifiedContent, setModifiedContent] = useState('');
  const [replaceSearch, setReplaceSearch] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [editingStep, setEditingStep] = useState(null);
  const [editedThought, setEditedThought] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState([]);
  const [clusters, setClusters] = useState([]);

  const getStepText = (value, isStepZero = false) => {
    if (!value) return '';
    if (isStepZero) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'text' in value[0]) {
            return value[0].text;
        }
    }
    if (typeof value === 'object' && value.text) return value.text;
    if (typeof value === 'string') return value;
    return '';
  };

  useEffect(() => {
    const keywordSearchTerms = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);

    let newFiltered = trajectory;

    if (keywordSearchTerms.length > 0) {
      newFiltered = newFiltered.filter(step => {
        const content = step.isStepZero
            ? getStepText(step.content, true).toLowerCase()
            : [getStepText(step.thought), getStepText(step.action), getStepText(step.observation)]
                .join(' ')
                .toLowerCase();
        return keywordSearchTerms.some(term => content.includes(term));
      });
    }

    if (semanticFilter) {
      const semanticIndices = new Set(semanticFilter.map(sf => sf.originalIndex));
      newFiltered = newFiltered.filter(step => semanticIndices.has(step.originalIndex));
      
      // Attach reasoning to the filtered steps
      const reasoningMap = new Map(semanticFilter.map(sf => [sf.originalIndex, sf.reasoning]));
      newFiltered = newFiltered.map(step => ({
        ...step,
        reasoning: reasoningMap.get(step.originalIndex)
      }));
    }

    setFilteredTrajectory(newFiltered);
    setCurrentIndex(0);
  }, [searchQuery, trajectory, semanticFilter]);

  const loadTrajectory = (contentString, filename = '') => {
    try {
      const data = JSON.parse(contentString);
      let processedTrajectory = [];

      // Parse filename for repo information
      const parseRepo = (filename) => {
        // Pattern: <repo owner>__<repo name>-<issue id (int)>.<some extension>
        const match = filename.match(/^(.+?)__(.+?)-(\d+)\./);
        if (match) {
          const [, owner, name] = match;
          return `${owner}/${name}`;
        }
        return null;
      };

      // Handle Step 0 from history
      if (data.history && data.history.length > 1) {
        const stepZero = {
          content: data.history[1].content,
          isStepZero: true,
        };
        
        // Add repo information if filename matches pattern
        const repo = parseRepo(filename);
        if (repo) {
          stepZero.repo = repo;
        }
        
        processedTrajectory.push(stepZero);
      }

      // Handle the rest of the trajectory
      if (data.trajectory && Array.isArray(data.trajectory)) {
        const trajectoryWithOriginalIndex = data.trajectory.map((step, index) => ({
          action: step.action,
          observation: step.observation,
          thought: step.thought,
          originalIndex: index + 1,
          clustered: false
        }));
        processedTrajectory = [...processedTrajectory, ...trajectoryWithOriginalIndex];
      }
      
      setTrajectory(processedTrajectory);
      // Reset all filters and the chat component
      handleClearFilters();
      setChatKey(key => key + 1);
      setHasUnsavedChanges(false);
    } catch (error) {
      alert('Error parsing JSON file.');
      console.error("File parsing error:", error);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        setFileContent(content);
        setModifiedContent(''); // Clear any previous modifications
        loadTrajectory(content, file.name);
      };
      reader.readAsText(file);
    }
  };

  const handleReplace = async () => {
    if (!replaceSearch) {
      alert('Please enter a search term for replacement.');
      return;
    }
    try {
      const response = await fetch('http://localhost:5001/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: modifiedContent || fileContent,
          search_term: replaceSearch,
          replace_term: replaceWith,
        }),
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setModifiedContent(data.modified_content);
      loadTrajectory(data.modified_content, fileName);
      alert('Replacement successful!');
      setHasUnsavedChanges(true);
    } catch (error) {
      alert(`Replacement failed: ${error.message}`);
    }
  };

  const handleSave = async () => {
    let contentToSave;
    
    if (modifiedContent) {
      // Use the modified content from search & replace
      contentToSave = modifiedContent;
    } else {
      // Reconstruct JSON with thought edits - need to update all references
      const originalData = JSON.parse(fileContent);
      let updatedData = JSON.parse(JSON.stringify(originalData)); // Deep copy
      
      // Build a map of original thoughts to edited thoughts
      const thoughtChanges = new Map();
      trajectory.filter(step => !step.isStepZero).forEach(step => {
        const originalStep = originalData.trajectory[step.originalIndex - 1];
        const originalThought = getStepText(originalStep.thought);
        const editedThought = getStepText(step.thought);
        
        if (originalThought !== editedThought) {
          thoughtChanges.set(originalThought, editedThought);
        }
      });
      
      // Function to recursively update any string that contains old thoughts
      const updateThoughtReferences = (obj) => {
        if (typeof obj === 'string') {
          let updatedString = obj;
          for (const [originalThought, editedThought] of thoughtChanges) {
            updatedString = updatedString.replace(new RegExp(escapeRegExp(originalThought), 'g'), editedThought);
          }
          return updatedString;
        } else if (Array.isArray(obj)) {
          return obj.map(updateThoughtReferences);
        } else if (obj !== null && typeof obj === 'object') {
          const updated = {};
          for (const [key, value] of Object.entries(obj)) {
            updated[key] = updateThoughtReferences(value);
          }
          return updated;
        }
        return obj;
      };
      
      // Helper function to escape special regex characters
      const escapeRegExp = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      };
      
      // Apply the updates to the entire data structure
      updatedData = updateThoughtReferences(updatedData);
      
      contentToSave = JSON.stringify(updatedData, null, 2);
    }

    console.log("Content to save:", contentToSave); // Debug log

    const newFileName = prompt("Enter new file name (e.g., 'new_trajectory.json'):", `modified_${fileName}`);
    if (newFileName) {
      try {
        const response = await fetch('http://localhost:5001/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: contentToSave,
            filename: newFileName,
          }),
        });
        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }
        console.log("Save response:", data); // Debug log
        alert(data.message);
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error("Save error:", error); // Debug log
        alert(`Save failed: ${error.message}`);
      }
    }
  };

  const handleEditThought = (stepIndex) => {
    const step = filteredTrajectory[stepIndex];
    setEditingStep(step.originalIndex);
    setEditedThought(getStepText(step.thought));
  };

  const handleSaveThought = () => {
    setTrajectory(prev => prev.map(step => 
      step.originalIndex === editingStep 
        ? { ...step, thought: editedThought }
        : step
    ));
    setEditingStep(null);
    setEditedThought('');
    setHasUnsavedChanges(true);
  };

  const handleCancelEdit = () => {
    setEditingStep(null);
    setEditedThought('');
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSemanticFilter(null);
  };

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : 0));
  };

  const goToNext = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex < filteredTrajectory.length - 1 ? prevIndex + 1 : prevIndex
    );
  };

  const handleSemanticFilter = (filteredSteps) => {
    setSemanticFilter(filteredSteps);
  };

  // highlightMatches moved to utils/highlight.js

  const currentStep = filteredTrajectory[currentIndex];

  const handleCluster = () => {
    const orderedSteps = trajectory
      .filter(step => selectedSteps.includes(step.originalIndex))
      .flatMap(step => step.clustered ? step.steps : [step])
      .sort((a, b) => a.originalIndex - b.originalIndex);
    const summary = orderedSteps.map(s => s.thought).join(' | ');
    const minIndex = Math.min(...selectedSteps);
    const cluster = {
      stepIds: [...selectedSteps].sort((a, b) => a - b),
      summary,
      steps: orderedSteps,
      originalIndex: minIndex,
      clustered: true,
      setSummary: (newSummary) => {
        setClusters(prev =>
          prev.map(c =>
            c.stepIds === selectedSteps ? { ...c, summary: newSummary } : c
          )
        );
      }
    };
    const newTrajectory = trajectory
      .filter(step => !selectedSteps.includes(step.originalIndex))
      .concat(cluster)
      .sort((a, b) => a.originalIndex - b.originalIndex);
    setTrajectory(newTrajectory);
    setClusters(prev => [...prev, cluster]);
    setSelectedSteps([]);
  };

  return (
    <div className="App">
      <div className="main-layout">
        <div className="trajectory-viewer-container">
          <header className="App-header">
            <h1>Trajectory Viewer</h1>
            <div className="controls-container">
              <div className="file-upload-container">
                <input type="file" id="file-upload" onChange={handleFileUpload} accept=".json" />
                <label htmlFor="file-upload" className="file-upload-button">
                  Upload JSON
                </label>
                {fileName && <span className="file-name">{fileName}</span>}
              <button
                onClick={() => {
                  const transformed = trajectory.map(step => {
                    if (step.isStepZero) {
                      return step; // Preserve Step 0 structure
                    }
                    if (!step.clustered) {
                      return {
                        action: step.action,
                        observation: step.observation,
                        thought: step.thought,
                        originalIndex: step.originalIndex,
                        clustered: false
                      };
                    }
                    const ordered = step.steps
                      .slice()
                      .sort((a, b) => a.originalIndex - b.originalIndex);
                    return {
                      originalIndex: step.originalIndex,
                      clustered: true,
                      stepIds: step.stepIds,
                      thought: step.thought || step.summary,
                      actions: ordered.map(s => s.action),
                      observations: ordered.map(s => s.observation)
                    };
                  });
                  downloadJSON(transformed, 'updated_trajectory.json');
                }}
                className="save-button"
              >
                Download JSON
              </button>
            </div>
              <div className="search-container">
                <input
                  type="text"
                  placeholder="Filter by keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {(searchQuery || semanticFilter) && (
                    <button onClick={handleClearFilters} className="clear-filter-button">
                        Clear Filters
                    </button>
                )}
              </div>
            </div>
          </header>
          <div className="replace-container">
              <input 
                type="text"
                placeholder="Search for..."
                value={replaceSearch}
                onChange={(e) => setReplaceSearch(e.target.value)}
              />
              <input 
                type="text"
                placeholder="Replace with..."
                value={replaceWith}
                onChange={(e) => setReplaceWith(e.target.value)}
              />
              <button onClick={handleReplace} disabled={!fileContent}>Replace All</button>
              {(modifiedContent || hasUnsavedChanges) && (
                <button onClick={handleSave} className="save-button">Save Modified</button>
              )}
          </div>
          <ClusterControls
            trajectory={trajectory}
            selectedSteps={selectedSteps}
            setSelectedSteps={setSelectedSteps}
            onCluster={handleCluster}
          />
          <div className="flex justify-center mb-4">
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                className={`px-4 py-2 text-sm font-medium border border-gray-300 rounded-l-md ${
                  !semanticFilter ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'
                }`}
                onClick={() => setSemanticFilter(null)}
              >
                Full Trajectory
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium border border-gray-300 rounded-r-md ${
                  semanticFilter ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'
                }`}
                onClick={() => setSemanticFilter(
                  trajectory.filter(step => step.clustered).map(step => ({
                    originalIndex: step.originalIndex,
                    reasoning: 'Clustered step'
                  }))
                )}
              >
                Cluster Overview
              </button>
            </div>
          </div>
          <main className="App-main">
{filteredTrajectory.length > 0 && currentStep ? (
<div className="trajectory-step bg-white shadow-md rounded-lg p-6 space-y-6">
  <div className="step-info">
    Step {currentStep.originalIndex} of {trajectory.length - 1}
    {(searchQuery.trim() || semanticFilter) &&
      <span className="filtered-count">
        {' '}(match {currentIndex + 1} of {filteredTrajectory.length})
      </span>
    }
  </div>
  <div className="navigation-buttons">
    <button onClick={goToPrevious} disabled={currentIndex === 0}>
      Previous
    </button>
    <button onClick={goToNext} disabled={currentIndex === filteredTrajectory.length - 1}>
      Next
    </button>
  </div>

  {currentStep.clustered && (
    <ClusteredStep
      cluster={currentStep}
      getStepText={getStepText}
      searchQuery={searchQuery}
    />
  )}
                
                {currentStep.isStepZero ? (
                  <div className="step-content">
                    <div className="step-item step-zero">
                      <h2>User Instructions (Step 0)</h2>
                      <p>{highlightMatches(currentStep.content, true, getStepText, searchQuery)}</p>
                    </div>
                  </div>
                ) : !currentStep.clustered && (
                  <div className="step-content">
                    {currentStep.reasoning && (
                      <div className="step-item reasoning">
                        <h2>Reasoning</h2>
                        <p>{currentStep.reasoning}</p>
                      </div>
                    )}
                    <div className="step-item border border-gray-200 rounded-md p-4 bg-gray-50">
                      <div className="step-header">
                        <h2>Thought</h2>
                        {editingStep === currentStep.originalIndex ? (
                          <div className="edit-buttons">
                            <button onClick={handleSaveThought} className="save-edit-btn">Save</button>
                            <button onClick={handleCancelEdit} className="cancel-edit-btn">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => handleEditThought(currentIndex)} className="edit-btn">Edit</button>
                        )}
                      </div>
                      {editingStep === currentStep.originalIndex ? (
                        <textarea
                          value={editedThought}
                          onChange={(e) => setEditedThought(e.target.value)}
                          className="thought-editor"
                          rows={6}
                        />
                      ) : (
                        <p>{highlightMatches(currentStep.thought, false, getStepText, searchQuery)}</p>
                      )}
                    </div>
                    <div className="step-item">
                      <h2>Action</h2>
                      <p>{highlightMatches(currentStep.action, false, getStepText, searchQuery)}</p>
                    </div>
                    <div className="step-item">
                      <h2>Observation</h2>
                      <p>{highlightMatches(currentStep.observation, false, getStepText, searchQuery)}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-data-message">
                <p>
                  {trajectory.length > 0
                    ? "No steps match your search criteria."
                    : "Please upload a trajectory JSON file to begin."}
                </p>
              </div>
            )}
          </main>
        </div>
        <div className="chat-pane">
          <Chat key={chatKey} trajectory={trajectory} onFilter={handleSemanticFilter} />
        </div>
      </div>
    </div>
  );
}

export default App;
