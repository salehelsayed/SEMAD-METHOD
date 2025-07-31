#!/usr/bin/env python3
"""
Run all TC*.py test files and generate a comprehensive report
"""
import os
import sys
import subprocess
import json
import datetime
import traceback

def run_single_test(test_file):
    """Run a single test file and return results"""
    test_name = os.path.basename(test_file).replace('.py', '')
    result = {
        'test_id': test_name.split('_')[0],
        'test_name': test_name,
        'status': 'UNKNOWN',
        'output': '',
        'error': '',
        'duration': 0
    }
    
    start_time = datetime.datetime.now()
    
    try:
        # Run the test
        proc = subprocess.run(
            [sys.executable, test_file],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
        
        end_time = datetime.datetime.now()
        result['duration'] = (end_time - start_time).total_seconds()
        
        result['output'] = proc.stdout
        result['error'] = proc.stderr
        
        if proc.returncode == 0:
            result['status'] = 'PASSED'
        else:
            result['status'] = 'FAILED'
            
    except subprocess.TimeoutExpired:
        result['status'] = 'TIMEOUT'
        result['error'] = 'Test execution timed out after 60 seconds'
    except Exception as e:
        result['status'] = 'ERROR'
        result['error'] = f"Exception during test execution: {str(e)}\n{traceback.format_exc()}"
    
    return result

def main():
    """Run all tests and generate report"""
    test_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Find all TC*.py files
    test_files = sorted([f for f in os.listdir(test_dir) if f.startswith('TC') and f.endswith('.py')])
    
    print(f"Found {len(test_files)} test files to execute")
    print("=" * 80)
    
    results = []
    
    # Run each test
    for i, test_file in enumerate(test_files):
        print(f"\nRunning test {i+1}/{len(test_files)}: {test_file}")
        test_path = os.path.join(test_dir, test_file)
        result = run_single_test(test_path)
        results.append(result)
        
        # Print summary
        status_symbol = "✅" if result['status'] == 'PASSED' else "❌"
        print(f"{status_symbol} {result['test_id']}: {result['status']} ({result['duration']:.2f}s)")
        
        if result['output']:
            print(f"   Output: {result['output'].strip()[:100]}...")
        if result['error']:
            print(f"   Error: {result['error'].strip()[:100]}...")
    
    # Generate summary
    print("\n" + "=" * 80)
    print("TEST EXECUTION SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for r in results if r['status'] == 'PASSED')
    failed = sum(1 for r in results if r['status'] == 'FAILED')
    errors = sum(1 for r in results if r['status'] == 'ERROR')
    timeouts = sum(1 for r in results if r['status'] == 'TIMEOUT')
    
    print(f"Total Tests: {len(results)}")
    print(f"Passed: {passed} ({passed/len(results)*100:.1f}%)")
    print(f"Failed: {failed} ({failed/len(results)*100:.1f}%)")
    print(f"Errors: {errors}")
    print(f"Timeouts: {timeouts}")
    
    # Save results to JSON
    results_file = os.path.join(test_dir, 'local_test_results.json')
    with open(results_file, 'w') as f:
        json.dump({
            'timestamp': datetime.datetime.now().isoformat(),
            'summary': {
                'total': len(results),
                'passed': passed,
                'failed': failed,
                'errors': errors,
                'timeouts': timeouts
            },
            'results': results
        }, f, indent=2)
    
    print(f"\nDetailed results saved to: {results_file}")
    
    return 0 if failed == 0 and errors == 0 else 1

if __name__ == "__main__":
    sys.exit(main())