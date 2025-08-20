// Adapter for converting between annotationTrace format and internal viewer format

export const detectFormat = (data) => {
  if (Array.isArray(data)) {
    // Check if it looks like annotationTrace array
    if (data.length > 0 && data[0].action && data[0].details) {
      return { format: 'annotationTrace-array', annotationTrace: data };
    }
    // Legacy trajectory array
    return { format: 'legacy-array', trajectory: data };
  }
  
  if (data.annotationTrace && Array.isArray(data.annotationTrace)) {
    return { format: 'annotationTrace-wrapper', annotationTrace: data.annotationTrace, fullDoc: data };
  }
  
  if (data.trajectory && Array.isArray(data.trajectory)) {
    return { format: 'legacy-wrapper', trajectory: data.trajectory, fullDoc: data };
  }
  
  return { format: 'unknown' };
};

export const actionToReadableString = (action, details) => {
  switch (action) {
    case 'execute_terminal_command':
      return `${details.command}${details.directory ? ` (cwd: ${details.directory})` : ''}`;
    
    case 'open_file':
      return `${details.file}`;
    
    case 'create_file':
      return `${details.file}`;
    
    case 'delete_file':
      return `${details.file}`;
    
    case 'close_file':
      return `${details.file}`;
    
    case 'search_string':
      return `"${details.searchKey}" in ${details.path}`;
    
    case 'search_web':
      return `"${details.query}"`;
    
    case 'select_code_chunks':
      return `${details.file}`;
    
    case 'find_and_replace_code':
      return `${details.file}`;
    
    case 'add_thought':
      return 'Adding thought';
    
    case 'begin_interaction':
      return `${details.repoName || 'repository'}`;
    
    case 'end_interaction':
      return 'Ending interaction';
    
    default:
      return action.replace(/_/g, ' ');
  }
};

export const detailsToObservation = (action, details) => {
  switch (action) {
    case 'execute_terminal_command':
      if (details.error) return `Error: ${details.error}`;
      if (details.output) return details.output;
      return '';
    
    case 'search_string':
      if (details.results && Array.isArray(details.results)) {
        if (details.results.length === 0) return 'No results found';
        return `Found ${details.results.length} results:\n${details.results.slice(0, 5).map(r => `- ${r}`).join('\n')}${details.results.length > 5 ? '\n...' : ''}`;
      }
      return '';
    
    case 'search_web':
      if (details.results && Array.isArray(details.results)) {
        if (details.results.length === 0) return 'No results found';
        return `Found ${details.results.length} results:\n${details.results.slice(0, 3).map(r => `- ${r}`).join('\n')}${details.results.length > 3 ? '\n...' : ''}`;
      }
      return '';
    
    case 'select_code_chunks':
      if (details.selections && Array.isArray(details.selections)) {
        const totalChars = details.selections.reduce((sum, sel) => sum + (sel.text ? sel.text.length : 0), 0);
        return `Selected ${details.selections.length} code chunk(s), ${totalChars} characters total`;
      }
      return '';
    
    case 'find_and_replace_code':
      if (details.changes && Array.isArray(details.changes)) {
        return `Made ${details.changes.length} change(s) in ${details.file}`;
      }
      return '';
    
    case 'open_file':
    case 'create_file':
    case 'delete_file':
    case 'close_file':
      return `File: ${details.file}`;
    
    default:
      return '';
  }
};

export const annotationTraceToViewerSteps = (annotationTrace) => {
  const steps = [];
  const annoIndexByOriginalIndex = new Map();
  let stepCounter = 1;
  
  // Look for begin_interaction to create Step 0
  const beginInteraction = annotationTrace.find(item => item.action === 'begin_interaction');
  if (beginInteraction) {
    const stepZero = {
      content: [{ 
        text: `Repository: ${beginInteraction.details.repoName || 'Unknown'}\n\nProblem Statement:\n${beginInteraction.details.problemStatement || 'Not provided'}\n\nUser Prompt:\n${beginInteraction.details.userPrompt || 'Not provided'}` 
      }],
      isStepZero: true,
      startTimestamp: beginInteraction.timestamp
    };
    steps.push(stepZero);
  }
  
  // Convert each annotation item to viewer step (excluding begin/end_interaction)
  annotationTrace.forEach((item, index) => {
    if (item.action === 'begin_interaction' || item.action === 'end_interaction') {
      return; // Skip these for normal step display
    }
    
    const viewerStep = {
      originalIndex: stepCounter,
      thought: item.thought || '',
      action: actionToReadableString(item.action, item.details),
      observation: detailsToObservation(item.action, item.details),
      partition: item.partition || null,
      timestamp: item.timestamp,
      clustered: false,
      stale: false,
      actionType: item.action // Store the original action type
    };
    
    steps.push(viewerStep);
    annoIndexByOriginalIndex.set(stepCounter, index);
    stepCounter++;
  });
  
  return { steps, annoIndexByOriginalIndex };
};

export const updateAnnotationTraceFromEdits = (originalAnnotationTrace, edits, annoIndexByOriginalIndex) => {
  const updatedTrace = [...originalAnnotationTrace];
  
  edits.forEach(edit => {
    const annoIndex = annoIndexByOriginalIndex.get(edit.originalIndex);
    if (annoIndex !== undefined && updatedTrace[annoIndex]) {
      if (edit.thought !== undefined) {
        updatedTrace[annoIndex] = { ...updatedTrace[annoIndex], thought: edit.thought };
      }
      if (edit.partition !== undefined) {
        updatedTrace[annoIndex] = { ...updatedTrace[annoIndex], partition: edit.partition };
      }
      if (edit.timestamp !== undefined) {
        updatedTrace[annoIndex] = { ...updatedTrace[annoIndex], timestamp: edit.timestamp };
      }
    }
  });
  
  return updatedTrace;
};

export const generateTimestampsFromStart = (annotationTrace, startTimestamp) => {
  if (!startTimestamp) return annotationTrace;
  
  const startTime = new Date(startTimestamp);
  let stepIndex = 0;
  
  return annotationTrace.map(item => {
    if (item.action === 'begin_interaction') {
      return { ...item, timestamp: startTimestamp };
    }
    
    if (item.action !== 'end_interaction') {
      stepIndex++;
    }
    
    const stepTime = new Date(startTime.getTime() + stepIndex * 10000); // 10 seconds per step
    return { ...item, timestamp: stepTime.toISOString() };
  });
};
