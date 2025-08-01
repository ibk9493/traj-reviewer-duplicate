import React from 'react';

const ClusterControls = ({ trajectory, selectedSteps, setSelectedSteps, onCluster }) => {
  // Get available step indices (excluding step 0, already clustered, or stale steps)
  const availableSteps = trajectory
    .filter(step => !step.isStepZero && !step.clustered && !step.stale)
    .map(step => step.originalIndex)
    .sort((a, b) => a - b);

  // Check if a selection forms a consecutive sequence within available steps
  const isSelectionConsecutive = (selection) => {
    if (selection.length <= 1) return true;
    
    const sortedSelection = [...selection].sort((a, b) => a - b);
    
    // Find where the selection starts in the list of available steps
    const firstIndexInAvailable = availableSteps.indexOf(sortedSelection[0]);
    if (firstIndexInAvailable === -1) return false;

    // Check if the selection is a contiguous slice of the available steps
    for (let i = 0; i < sortedSelection.length; i++) {
      if (sortedSelection[i] !== availableSteps[firstIndexInAvailable + i]) {
        return false;
      }
    }
    
    return true;
  };

  // Determine if a step can be selected
  const canSelectStep = (stepIndex) => {
    // Can always deselect
    if (selectedSteps.includes(stepIndex)) return true;
    
    // Can't select an unavailable step
    if (!availableSteps.includes(stepIndex)) return false;

    // Check if adding this step would maintain consecutiveness
    const testSelection = [...selectedSteps, stepIndex];
    return isSelectionConsecutive(testSelection);
  };
  
  const handleToggle = (index) => {
    // Safety check - should be prevented by UI
    if (!canSelectStep(index)) return;

    setSelectedSteps(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div className="cluster-controls bg-white shadow rounded-lg p-4 mb-6">
      <h3 className="text-lg font-semibold mb-2">Cluster Consecutive Steps</h3>
      <p className="text-sm text-gray-600 mb-3">
        Select consecutive steps from the available list to group them together.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
        {trajectory
          .filter(step => !step.isStepZero)
          .map((step) => {
            const isSelectable = canSelectStep(step.originalIndex);
            const isClustered = step.clustered;
            const isStale = step.stale;
            const isDisabled = isClustered || isStale || !isSelectable;
            
            return (
              <label 
                key={step.originalIndex} 
                className={`flex items-center space-x-2 text-sm p-2 rounded-md transition-all duration-200 ${
                  isDisabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'cursor-pointer hover:bg-blue-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={selectedSteps.includes(step.originalIndex)}
                  onChange={() => handleToggle(step.originalIndex)}
                  disabled={isDisabled}
                />
                <span className={isDisabled ? 'text-gray-500' : 'text-gray-800'}>
                  Step {step.originalIndex} 
                  {isClustered ? ' (Clustered)' : ''}
                  {isStale ? ' (Stale)' : ''}
                </span>
              </label>
            );
          })}
      </div>
      <button
        onClick={onCluster}
        disabled={selectedSteps.length < 2}
        className={`px-4 py-2 rounded text-white font-medium transition-colors duration-200 ${
          selectedSteps.length >= 2 
            ? 'bg-blue-600 hover:bg-blue-700' 
            : 'bg-gray-400 cursor-not-allowed'
        }`}
      >
        Create Cluster ({selectedSteps.length} steps)
      </button>
    </div>
  );
};

export default ClusterControls;
