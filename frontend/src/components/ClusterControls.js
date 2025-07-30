import React from 'react';

const ClusterControls = ({ trajectory, selectedSteps, setSelectedSteps, onCluster }) => {
  const toggleStepSelection = (index) => {
    setSelectedSteps(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  return (
    <div className="cluster-controls bg-white shadow rounded-lg p-4 mb-6">
      <h3 className="text-lg font-semibold mb-2">Cluster Steps</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
        {trajectory
          .filter(step => !step.isStepZero)
          .map((step) => (
            <label key={step.originalIndex} className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                className="form-checkbox text-blue-600"
                checked={selectedSteps.includes(step.originalIndex)}
                onChange={() => toggleStepSelection(step.originalIndex)}
              />
              <span>Step {step.originalIndex}</span>
            </label>
          ))}
      </div>
      <button
        onClick={onCluster}
        disabled={selectedSteps.length < 2}
        className={`px-4 py-2 rounded text-white font-medium ${
          selectedSteps.length < 2 ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        Create Cluster
      </button>
    </div>
  );
};

export default ClusterControls;
