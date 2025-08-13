import React, { useState } from 'react';
import { highlightMatches } from '../utils/highlight';

const ClusteredStep = ({ cluster, getStepText, searchQuery, onUncluster, onEditSummary, onUpdateCluster }) => {
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
        {cluster.timestamp && (
          <span className="timestamp-info" style={{ marginLeft: 16, color: '#666', fontSize: 14 }}>
            {new Date(cluster.timestamp).toLocaleString()}
          </span>
        )}
        <button onClick={() => setExpanded(!expanded)} className="expand-btn">
          {expanded ? 'Collapse' : 'Expand'}
        </button>
        {onUncluster && (
          <button
            onClick={() => onUncluster(cluster)}
            className="uncluster-btn"
            style={{
              marginLeft: 12,
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '8px 20px',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(239,68,68,0.08)'
            }}
            title="Uncluster"
          >
            Uncluster
          </button>
        )}
      </div>
      
      <div className="step-item border border-gray-200 rounded-md p-4 bg-gray-50">
        <div className="step-header">
          <h2>Clustered Thought</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 500 }}>Partition:</label>
              <select
                value={cluster.partition || ''}
                onChange={(e) => {
                  const newPartition = e.target.value || null;
                  if (onUpdateCluster) {
                    onUpdateCluster({ ...cluster, partition: newPartition });
                  }
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  fontSize: 14,
                  minWidth: 140
                }}
              >
                <option value="">None</option>
                <option value="EnvironmentSetup">EnvironmentSetup</option>
                <option value="FailtoPassUnitTest">FailtoPassUnitTest</option>
                <option value="Solution">Solution</option>
              </select>
            </div>
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
            {editedSummary || cluster.summary || cluster.thought || ''}
          </p>
        )}
      </div>

      {expanded && (
        <div className="step-content cluster-details space-y-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Action-Observation Pairs</h3>
          {(Array.isArray(cluster.steps) && cluster.steps.length > 0
            ? cluster.steps
            : (Array.isArray(cluster.actions) && Array.isArray(cluster.observations)
                ? cluster.stepIds.map((id, i) => ({
                    originalIndex: id,
                    action: cluster.actions[i],
                    observation: cluster.observations[i],
                    thought: '',
                    clustered: false,
                    stale: false
                  }))
                : [])
          ).map((step, idx) => (
            <div key={`action-obs-${idx}`} className="action-observation-pair">
              {/* Action Section */}
              <div className="step-item border border-gray-200 rounded-md p-4 bg-blue-50 mb-2">
                <div className="step-header">
                  <h2>Action - Step {step.originalIndex}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 500 }}>Partition:</label>
                      <select
                        value={step.partition || ''}
                        onChange={(e) => {
                          const newPartition = e.target.value || null;
                          if (onUpdateCluster) {
                            const updatedSteps = cluster.steps.map(s =>
                              s.originalIndex === step.originalIndex
                                ? { ...s, partition: newPartition }
                                : s
                            );
                            onUpdateCluster({ ...cluster, steps: updatedSteps });
                          }
                        }}
                        style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: '1px solid #ccc',
                          fontSize: 12,
                          minWidth: 120
                        }}
                      >
                        <option value="">None</option>
                        <option value="EnvironmentSetup">EnvironmentSetup</option>
                        <option value="FailtoPassUnitTest">FailtoPassUnitTest</option>
                        <option value="Solution">Solution</option>
                      </select>
                    </div>
                    <button 
                      onClick={() => toggleActionExpansion(step.originalIndex)}
                      className="expand-btn text-sm"
                    >
                      {expandedActions.has(step.originalIndex) ? 'Hide Observation' : 'Show Observation'}
                    </button>
                  </div>
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
