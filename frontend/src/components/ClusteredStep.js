import React, { useState } from 'react';
import { highlightMatches } from '../utils/highlight';

const ClusteredStep = ({ cluster, getStepText, searchQuery, onUncluster, onEditSummary }) => {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(cluster.summary);
  const [expandedActions, setExpandedActions] = useState(new Set());

  const toggleActionExpansion = (stepIndex) => {
    setExpandedActions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepIndex)) {
        newSet.delete(stepIndex);
      } else {
        newSet.add(stepIndex);
      }
      return newSet;
    });
  };

  // Keep editedSummary in sync if cluster.summary changes
  React.useEffect(() => {
    setEditedSummary(cluster.summary);
  }, [cluster.summary]);

  return (
    <div className="step-item clustered-step">
      <div className="step-header">
        <h2>Clustered Step ({cluster.stepIds.join(', ')})</h2>
        <button onClick={() => setExpanded(!expanded)} className="expand-btn">
          {expanded ? 'Collapse' : 'Expand'}
        </button>
        {onUncluster && (
          <button
            onClick={() => onUncluster(cluster)}
            className="ml-2 px-2 py-1 bg-red-500 text-white rounded text-xs"
            title="Uncluster"
          >
            Uncluster
          </button>
        )}
      </div>
      
      <div className="step-item border border-gray-200 rounded-md p-4 bg-gray-50">
        <div className="step-header">
          <h2>Clustered Thought</h2>
          {editing ? (
            <div className="edit-buttons">
              <button
                className="save-edit-btn"
                onClick={() => {
                  if (onEditSummary) onEditSummary(cluster, editedSummary);
                  setEditing(false);
                }}
              >
                Save
              </button>
              <button
                className="cancel-edit-btn"
                onClick={() => {
                  setEditedSummary(cluster.summary);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button className="edit-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <textarea
            value={editedSummary}
            onChange={(e) => setEditedSummary(e.target.value)}
            className="thought-editor"
            rows={6}
          />
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-wrap">
            {editedSummary}
          </p>
        )}
      </div>

      {expanded && (
        <div className="step-content cluster-details space-y-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Action-Observation Pairs</h3>
          {cluster.steps.map((step, idx) => (
            <div key={`action-obs-${idx}`} className="action-observation-pair">
              {/* Action Section */}
              <div className="step-item border border-gray-200 rounded-md p-4 bg-blue-50 mb-2">
                <div className="step-header">
                  <h2>Action - Step {step.originalIndex}</h2>
                  <button 
                    onClick={() => toggleActionExpansion(step.originalIndex)}
                    className="expand-btn text-sm"
                  >
                    {expandedActions.has(step.originalIndex) ? 'Hide Observation' : 'Show Observation'}
                  </button>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {highlightMatches(step.action, false, getStepText, searchQuery)}
                </p>
              </div>

              {/* Observation Section - Only shown when action is expanded */}
              {expandedActions.has(step.originalIndex) && (
                <div className="step-item border border-gray-200 rounded-md p-4 bg-green-50 ml-4 mb-2">
                  <div className="step-header">
                    <h2>Observation - Step {step.originalIndex}</h2>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {highlightMatches(step.observation, false, getStepText, searchQuery)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClusteredStep;
