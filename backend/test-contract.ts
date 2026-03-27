import { FlowContractService } from './src/services/flowContract.service';

const mockSteps = [
    {
        id: 'step_00_identity',
        type: 'prompt',
        config: {
            prompt: "Genera una IDENTIDAD COMPLETA para Microsoft. Lista de variables: username, password, firstName, lastName, name, surname, random8, random16_complex, birthMonth, birthDay, birthYear"
        }
    },
    {
        id: 'step_02_type_username',
        type: 'type',
        config: {
            selector: 'input[name="MemberName"]',
            text: '{{username}}'
        }
    }
];

const report = FlowContractService.validateRunVariables(mockSteps, {});
console.log('Contract Valid:', report.valid);
console.log('Errors:', report.errors);
console.log('Steps with required bindings:', report.steps.filter(s => s.requiredBindings.length > 0).map(s => ({ id: s.stepId, bindings: s.requiredBindings })));

// Test the regex directly
const prompt = mockSteps[0].config.prompt;
if (prompt) {
  const generated = new Set<string>();
  const keyPattern = /\b([a-zA-Z0-9_.\u00C0-\u00FF]{3,})\b/g;
  const blacklist = ['genera', 'lista', 'variables', 'identidad', 'para', 'completa', 'microsoft', 'puro', 'json'];
  let match;
  while ((match = keyPattern.exec(prompt)) !== null) {
      const k = match[1];
      if (!blacklist.includes(k.toLowerCase())) {
        generated.add(k);
      }
  }
  console.log('Detected from prompt regex:', [...generated]);
}

