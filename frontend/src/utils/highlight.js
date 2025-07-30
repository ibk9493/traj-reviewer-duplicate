import React from 'react';

export const highlightMatches = (text, isStepZero = false, getStepText, searchQuery) => {
  const stringText = getStepText(text, isStepZero);
  const searchTerms = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (searchTerms.length === 0) return stringText;
  const regex = new RegExp(`(${searchTerms.join('|')})`, 'gi');
  return stringText.split(regex).map((part, index) =>
    searchTerms.some(term => part.toLowerCase() === term)
      ? <mark key={index}>{part}</mark>
      : part
  );
};
