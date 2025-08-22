function getAggregatedHealthStatus() {
  return {
    summary: {
      totalAgents: 0,
      healthyAgents: 0,
      degradedAgents: 0,
      unhealthyAgents: 0,
      totalChecks: 0
    },
    agents: {},
    criticalIssues: [],
    recommendations: []
  };
}

module.exports = { getAggregatedHealthStatus };

