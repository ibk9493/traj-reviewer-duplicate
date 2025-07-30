import React, { useState } from 'react';
import { highlightMatches } from '../utils/highlight';

const ClusteredStep = ({ cluster, getStepText, searchQuery }) => {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(cluster.summary);

  return (
    <div className="step-item clustered-step">
      <div className="step-header">
        <h2>Clustered Step ({cluster.stepIds.join(', ')})</h2>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      <div className="step-item border border-gray-200 rounded-md p-4 bg-gray-50">
        <div className="step-header">
          <h2>Clustered Thought</h2>
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
        <div className="edit-buttons mt-2">
          {editing ? (
            <>
              <button
                className="save-edit-btn"
                onClick={() => {
                  cluster.setSummary(editedSummary);
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
            </>
          ) : (
            <button className="edit-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="step-content cluster-details space-y-6">
          <div className="space-y-4">
            {cluster.steps.map((step, idx) => (
              <div key={`a-${idx}`} className="step-item border border-gray-200 rounded-md p-4 bg-gray-50 mb-2">
                <div className="step-header">
                  <h2>Action - Step {step.originalIndex}</h2>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {highlightMatches(step.action, false, getStepText, searchQuery)}
                </p>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            {cluster.steps.map((step, idx) => (
              <div key={`o-${idx}`} className="step-item border border-gray-200 rounded-md p-4 bg-gray-50 mb-2">
                <div className="step-header">
                  <h2>Observation - Step {step.originalIndex}</h2>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {highlightMatches(step.observation, false, getStepText, searchQuery)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClusteredStep;
