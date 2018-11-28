#!/bin/bash -xev

CI_DIR="$( cd "$( dirname "$0" )" && pwd )"

"$CI_DIR/setup.sh"
"$CI_DIR/lint.sh"
"$CI_DIR/test.sh"
