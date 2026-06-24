""" A script that goes through all the individual shape files and does some consistency checks.

    The checks and prints performed are the following:
    - All files have set ids and hashes and there is no duplicate ids.
    - For all files (old_id, type) is unique_together
    - Urban Areas, Districts, Areas and Metro have all exactly one polygon without holes
    -

"""