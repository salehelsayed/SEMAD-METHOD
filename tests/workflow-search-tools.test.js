const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

describe('Workflow Search Tools Integration', () => {
  const workflowDir = path.join(__dirname, '..', 'bmad-core', 'workflows');
  const workflows = [
    'greenfield-fullstack.yaml',
    'greenfield-service.yaml',
    'greenfield-ui.yaml',
    'brownfield-fullstack.yaml',
    'brownfield-service.yaml',
    'brownfield-ui.yaml'
  ];

  workflows.forEach(workflowFile => {
    describe(`${workflowFile}`, () => {
      const workflowPath = path.join(workflowDir, workflowFile);
      let workflow;

      beforeAll(() => {
        const content = fs.readFileSync(workflowPath, 'utf8');
        workflow = yaml.load(content);
      });

      test('should have generate_search_tools step after PRD creation', () => {
        const sequence = workflow.workflow.sequence;
        
        // Find PRD creation step
        let prdStepIndex = -1;
        let searchToolsStepIndex = -1;

        sequence.forEach((step, index) => {
          if (step.creates === 'prd.md') {
            prdStepIndex = index;
          }
          if (step.action === 'generate_search_tools') {
            searchToolsStepIndex = index;
          }
        });

        // PRD step should exist
        expect(prdStepIndex).toBeGreaterThan(-1);
        
        // Search tools step should exist
        expect(searchToolsStepIndex).toBeGreaterThan(-1);
        
        // Search tools should come after PRD
        expect(searchToolsStepIndex).toBe(prdStepIndex + 1);
      });

      test('generate_search_tools step should have correct configuration', () => {
        const searchToolsStep = workflow.workflow.sequence.find(
          step => step.action === 'generate_search_tools'
        );

        expect(searchToolsStep).toBeDefined();
        expect(searchToolsStep.agent).toBe('sm');
        expect(searchToolsStep.requires).toBe('prd.md');
        expect(searchToolsStep.creates).toBe('search-tools.yaml');
        expect(searchToolsStep.notes).toContain('Extracts keywords from PRD');
      });

      test('workflow should maintain proper step order', () => {
        const sequence = workflow.workflow.sequence;
        const searchToolsStep = sequence.find(step => step.action === 'generate_search_tools');
        const searchToolsIndex = sequence.indexOf(searchToolsStep);

        // Verify previous step creates PRD
        if (searchToolsIndex > 0) {
          const previousStep = sequence[searchToolsIndex - 1];
          expect(previousStep.creates).toBe('prd.md');
        }

        // Verify next step can depend on search-tools.yaml if needed
        if (searchToolsIndex < sequence.length - 1) {
          const nextStep = sequence[searchToolsIndex + 1];
          // Next step should still work without requiring search-tools.yaml
          // (it's an optional enhancement)
          expect(nextStep).toBeDefined();
        }
      });
    });
  });

  test('all workflows should be valid YAML', () => {
    workflows.forEach(workflowFile => {
      const workflowPath = path.join(workflowDir, workflowFile);
      const content = fs.readFileSync(workflowPath, 'utf8');
      
      expect(() => {
        yaml.load(content);
      }).not.toThrow();
    });
  });
});