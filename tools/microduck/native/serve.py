"""Serve the native library's local app gateway using the prepared Python environment."""
from probe import WORKSPACE
from botlab_microduck_native.gateway import main

if __name__ == '__main__':
    main()
