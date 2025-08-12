import React, { useState, useEffect } from 'react';
import './App.css';
import Chat from './Chat';
import ClusterControls from './components/ClusterControls';
import ClusteredStep from './components/ClusteredStep';
import AuthHeader from './components/AuthHeader';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { downloadJSON } from './utils/download';
import { highlightMatches } from './utils/highlight';
import { openDB } from 'idb';
import { API_BASE_URL } from './config';

// IndexedDB utility for app state
const DB_NAME = 'traj-reviewer';
const DB_STORE = 'state';
const DB_KEY = 'appState';

async function saveAppState(state) {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(DB_STORE);
    },
  });
  await db.put(DB_STORE, state, DB_KEY);
}

async function loadAppState() {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(DB_STORE);
    },
  });
  return await db.get(DB_STORE, DB_KEY);
}

async function clearAppState() {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(DB_STORE);
    },
  });
  await db.clear(DB_STORE);
}

function App() {
  const { isAuthenticated, loading } = useAuth();
  
  // Track if we loaded from cache for notification
  const [loadedFromCache, setLoadedFromCache] = useState(false);
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

  // On mount, try to load from IndexedDB - only run when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      const cached = await loadAppState();
      if (cached && cached.trajectory && cached.trajectory.length > 0) {
        setTrajectory(cached.trajectory);
        setFilteredTrajectory(cached.filteredTrajectory || []);
        setCurrentIndex(cached.currentIndex || 0);
        setFileName(cached.fileName || '');
        setSearchQuery(cached.searchQuery || '');
        setSemanticFilter(cached.semanticFilter || null);
        setChatKey(cached.chatKey || 0);
        setFileContent(cached.fileContent || '');
        setModifiedContent(cached.modifiedContent || '');
        setReplaceSearch(cached.replaceSearch || '');
        setReplaceWith(cached.replaceWith || '');
        setEditingStep(cached.editingStep || null);
        setEditedThought(cached.editedThought || '');
        setHasUnsavedChanges(cached.hasUnsavedChanges || false);
        setSelectedSteps(cached.selectedSteps || []);
        setClusters(cached.clusters || []);
        setLoadedFromCache(true);
      }
    })();
  }, []);

  // On any relevant state change, save to IndexedDB
  useEffect(() => {
    const state = {
      trajectory,
      filteredTrajectory,
      currentIndex,
      fileName,
      searchQuery,
      semanticFilter,
      chatKey,
      fileContent,
      modifiedContent,
      replaceSearch,
      replaceWith,
      editingStep,
      editedThought,
      hasUnsavedChanges,
      selectedSteps,
      clusters,
    };
    saveAppState(state);
  }, [
    trajectory,
    filteredTrajectory,
    currentIndex,
    fileName,
    searchQuery,
    semanticFilter,
    chatKey,
    fileContent,
    modifiedContent,
    replaceSearch,
    replaceWith,
    editingStep,
    editedThought,
    hasUnsavedChanges,
    selectedSteps,
    clusters,
  ]);

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
      // Debug: log trajectory and semanticFilter
      console.log('DEBUG: trajectory:', trajectory);
      console.log('DEBUG: semanticFilter:', semanticFilter);
      // If semanticFilter contains full cluster objects, use them directly
      if (semanticFilter.length > 0 && semanticFilter[0].clustered) {
        newFiltered = semanticFilter;
      } else {
        const semanticIndices = new Set(semanticFilter.map(sf => sf.originalIndex));
        newFiltered = newFiltered.filter(step => semanticIndices.has(step.originalIndex));
        // Attach reasoning to the filtered steps
        const reasoningMap = new Map(semanticFilter.map(sf => [sf.originalIndex, sf.reasoning]));
        newFiltered = newFiltered.map(step => ({
          ...step,
          reasoning: reasoningMap.get(step.originalIndex)
        }));
      }
      // Debug: log newFiltered
      console.log('DEBUG: newFiltered:', newFiltered);
    }

    setFilteredTrajectory(newFiltered);
    // setCurrentIndex(0); // Removed: only reset index on file load or filter clear
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

      // Handle Step 0 from history (tool output format)
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

      // Handle Step 0 from array (app download format)
      let inputTrajectory = [];
      if (Array.isArray(data)) {
        // Uploaded file is an array (app download)
        if (data.length > 0 && data[0].isStepZero) {
          processedTrajectory.push(data[0]);
          inputTrajectory = data.slice(1);
        } else {
          inputTrajectory = data;
        }
      } else if (data.trajectory && Array.isArray(data.trajectory)) {
        // Uploaded file is an object with trajectory key (tool output)
        inputTrajectory = data.trajectory;
      }
      if (inputTrajectory.length > 0) {
        const enhancedTrajectory = inputTrajectory.map((step, index) => {
          const isCluster =
            step.clustered === true &&
            Array.isArray(step.stepIds) &&
            (Array.isArray(step.steps) || (Array.isArray(step.actions) && Array.isArray(step.observations)));
          // Debug: log each step and cluster detection
          console.log('DEBUG: step at upload:', step, 'isCluster:', isCluster);
          if (isCluster) {
            // If steps is missing but actions/observations are present, reconstruct steps
            let stepsArr = Array.isArray(step.steps) ? step.steps : [];
            if ((!stepsArr || stepsArr.length === 0) && Array.isArray(step.actions) && Array.isArray(step.observations)) {
              stepsArr = step.stepIds.map((id, i) => ({
                originalIndex: id,
                action: step.actions[i],
                observation: step.observations[i],
                thought: '', // No thought in flat cluster download, can be improved if needed
                clustered: false,
                stale: false
              }));
            }
            return {
              ...step,
              clustered: true,
              stale: !!step.stale,
              summary: typeof step.summary === 'string' ? step.summary : '',
              steps: stepsArr,
              stepIds: Array.isArray(step.stepIds) ? step.stepIds : [],
              // Ensure originalIndex is present
              originalIndex: typeof step.originalIndex === 'number' ? step.originalIndex : index + 1
            };
          } else {
            // Normal step (tool output or app)
            return {
              action: step.action,
              observation: step.observation,
              thought: step.thought,
              originalIndex: typeof step.originalIndex === 'number' ? step.originalIndex : index + 1,
              clustered: false,
              stale: !!step.stale
            };
          }
        });
        processedTrajectory = [...processedTrajectory, ...enhancedTrajectory];
      }
      
      setTrajectory(processedTrajectory);
      // Reconstruct clusters array from loaded trajectory
      setClusters(processedTrajectory.filter(step => step.clustered));
      // Debug: log loaded trajectory and clusters
      console.log('DEBUG: loaded trajectory after upload:', processedTrajectory);
      console.log('DEBUG: loaded clusters after upload:', processedTrajectory.filter(step => step.clustered));
      // Reset all filters and the chat component
      handleClearFilters();
      setCurrentIndex(0); // Reset to first step when clearing filters
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
      const response = await fetch(`${API_BASE_URL}/replace`, {
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
        const response = await fetch(`${API_BASE_URL}/save`, {
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
    setCurrentIndex(0); // Reset to first step when clearing filters
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
    const stepIds = [...selectedSteps].sort((a, b) => a - b);
    const cluster = {
      stepIds,
      summary,
      steps: orderedSteps,
      originalIndex: minIndex,
      clustered: true
    };
    const newTrajectory = trajectory
      .filter(step => !selectedSteps.includes(step.originalIndex))
      .concat(cluster)
      .sort((a, b) => a.originalIndex - b.originalIndex);
    setTrajectory(newTrajectory);
    setClusters(prev => [...prev, cluster]);
    setSelectedSteps([]);
    // After clustering, go to the new cluster in the filteredTrajectory
    setTimeout(() => {
      setFilteredTrajectory(ft => {
        const idx = ft.findIndex(s => s.clustered && s.originalIndex === minIndex);
        if (idx !== -1) setCurrentIndex(idx);
        return ft;
      });
    }, 0);
  };

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <div className="App" style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: 16
      }}>
        <h1>Trajectory Viewer</h1>
        <div style={{ color: '#666' }}>Loading...</div>
      </div>
    );
  }

  // Show authentication screen if not logged in
  if (!isAuthenticated) {
    return (
      <div className="App" style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: 24,
        padding: 20
      }}>
        <h1 style={{ marginBottom: 8 }}>Trajectory Viewer</h1>
        <p style={{ color: '#666', textAlign: 'center', maxWidth: 400 }}>
          This application is restricted to users with @turing email addresses. 
          Please sign up or log in to access the trajectory analysis tools.
        </p>
        <AuthHeader />
      </div>
    );
  }

  return (
    <div className="App">
      <div className="main-layout">
        <div className="trajectory-viewer-container">
          <header className="App-header">
            <h1>Trajectory Viewer</h1>
            <AuthHeader />
            {loadedFromCache && (
              <div style={{ color: 'orange', fontWeight: 'bold', marginBottom: 8 }}>
                Loaded from cache (IndexedDB)
              </div>
            )}
            <div className="controls-container">
              <div className="file-upload-container">
                <button
                  onClick={async () => {
                    await clearAppState();
                    alert('Cache cleared! (Current session is unaffected)');
                  }}
                  className="clear-cache-btn"
                  style={{ marginRight: 8, background: '#f87171', color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px' }}
                  title="Clear cached data (does not reset current session)"
                >
                  Clear Cache
                </button>
                <input type="file" id="file-upload" onChange={handleFileUpload} accept=".json" />
                <label htmlFor="file-upload" className="file-upload-button">
                  Upload JSON
                </label>
                {fileName && <span className="file-name">{fileName}</span>}
              <button
                onClick={() => {
                  const transformed = [
                    // Always include Step 0 if present
                    ...trajectory.filter(step => step.isStepZero),
                    // Then include all other non-stale steps
                    ...trajectory
                      .filter(step => !step.isStepZero && !step.stale)
                      .map(step => {
                        if (!step.clustered) {
                          return {
                            action: step.action,
                            observation: step.observation,
                            thought: step.thought,
                            originalIndex: step.originalIndex,
                            clustered: false,
                            stale: !!step.stale
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
                          observations: ordered.map(s => s.observation),
                          stale: !!step.stale
                        };
                      })
                  ];
                  downloadJSON(transformed, 'updated_trajectory.json');
                }}
                className="download-json-btn"
                style={{
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 28px',
                  fontWeight: 700,
                  fontSize: 18,
                  marginLeft: 12,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.08)'
                }}
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
                onClick={() => {
                  // Restore original logic: filter by index, attach reasoning
                  setSemanticFilter(
                    trajectory
                      .filter(step => step.clustered)
                      .map(step => ({
                        originalIndex: step.originalIndex,
                        reasoning: 'Clustered step'
                      }))
                  );
                  setCurrentIndex(0); // Always show the first cluster in overview
                }}
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
  <div
    className="step-navigation-controls"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      marginBottom: 16,
      flexWrap: 'wrap'
    }}
  >
    <form
      onSubmit={e => {
        e.preventDefault();
        const stepNum = parseInt(e.target.elements.goToStep.value, 10);
        if (
          !isNaN(stepNum) &&
          stepNum >= 1 &&
          stepNum <= filteredTrajectory.length
        ) {
          setCurrentIndex(stepNum - 1);
        }
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
    >
      <label htmlFor="goToStep" style={{ fontWeight: 500, marginRight: 4 }}>Go to Step:</label>
      <input
        id="goToStep"
        name="goToStep"
        type="number"
        min={1}
        max={filteredTrajectory.length}
        defaultValue={currentIndex + 1}
        style={{ width: 60, padding: 4, borderRadius: 4, border: '1px solid #ccc', fontSize: 16 }}
      />
      <button
        type="submit"
        style={{
          background: '#22c55e',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          padding: '6px 18px',
          fontWeight: 700,
          fontSize: 16,
          cursor: 'pointer'
        }}
      >
        Go
      </button>
    </form>
    <div className="navigation-buttons" style={{ display: 'flex', gap: 16 }}>
      <button
        onClick={goToPrevious}
        disabled={currentIndex === 0}
        style={{
          background: '#22c55e',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '12px 36px',
          fontWeight: 700,
          fontSize: 20,
          cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
          opacity: currentIndex === 0 ? 0.6 : 1
        }}
      >
        Previous
      </button>
      <button
        onClick={goToNext}
        disabled={currentIndex === filteredTrajectory.length - 1}
        style={{
          background: '#22c55e',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '12px 36px',
          fontWeight: 700,
          fontSize: 20,
          cursor: currentIndex === filteredTrajectory.length - 1 ? 'not-allowed' : 'pointer',
          opacity: currentIndex === filteredTrajectory.length - 1 ? 0.6 : 1
        }}
      >
        Next
      </button>
    </div>
  </div>

  {currentStep.clustered && (
    <ClusteredStep
      cluster={currentStep}
      getStepText={getStepText}
      searchQuery={searchQuery}
      onEditSummary={(cluster, newSummary) => {
        // Update summary in both clusters and trajectory
        setClusters(prev =>
          prev.map(c =>
            c.stepIds.join(',') === cluster.stepIds.join(',') ? { ...c, summary: newSummary } : c
          )
        );
        setTrajectory(prev =>
          prev.map(s =>
            s.clustered && s.stepIds && s.stepIds.join(',') === cluster.stepIds.join(',') ? { ...s, summary: newSummary } : s
          )
        );
      }}
      onUncluster={(cluster) => {
        // Remove the cluster from trajectory and clusters
        setTrajectory(prev => {
          // Remove the cluster
          let withoutCluster = prev.filter(
            step => !(step.clustered && step.stepIds && step.stepIds.join(',') === cluster.stepIds.join(','))
          );
          // Restore steps (preserve their properties)
          const restoredSteps = cluster.steps.map(s => ({
            ...s,
            clustered: false
          }));
          // Remove any duplicates (in case steps are already present)
          const allSteps = [
            ...withoutCluster.filter(s => !restoredSteps.some(r => r.originalIndex === s.originalIndex)),
            ...restoredSteps
          ];
          // Sort by originalIndex
          return allSteps.sort((a, b) => a.originalIndex - b.originalIndex);
        });
        setClusters(prev =>
          prev.filter(
            c => !(c.stepIds && c.stepIds.join(',') === cluster.stepIds.join(','))
          )
        );
      }}
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
                          <>
                            <button onClick={() => handleEditThought(currentIndex)} className="edit-btn">Edit</button>
                            {currentStep.stale
                              ? <button
                                  onClick={() => {
                                    setTrajectory(prev => prev.map(step =>
                                      step.originalIndex === currentStep.originalIndex
                                        ? { ...step, stale: false }
                                        : step
                                    ));
                                  }}
                                  className="restore-btn"
                                  style={{
                                    background: '#22c55e',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '6px 16px',
                                    fontWeight: 600,
                                    marginLeft: 8,
                                    cursor: 'pointer',
                                    fontSize: 15
                                  }}
                                >Restore</button>
                              : <button
                                  onClick={() => {
                                    setTrajectory(prev => prev.map(step =>
                                      step.originalIndex === currentStep.originalIndex
                                        ? { ...step, stale: true }
                                        : step
                                    ));
                                    setHasUnsavedChanges(true);
                                  }}
                                  className="stale-btn"
                                  style={{
                                    background: '#f59e42',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '6px 16px',
                                    fontWeight: 600,
                                    marginLeft: 8,
                                    cursor: 'pointer',
                                    fontSize: 15
                                  }}
                                >Mark as Stale</button>
                            }
                          </>
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

// Wrap App with AuthProvider
function AppWithAuth() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

export default AppWithAuth;
