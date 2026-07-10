# -*- coding: utf-8 -*-
from . import models


def _bz_post_init(env):
    """Grandfather historical purchase agreements.

    The new Brandzo approval guard blocks confirming a requisition that is not
    ``approved``. Records confirmed BEFORE this module was installed have no
    approval state, so we stamp them as approved to avoid retro-blocking them.
    """
    env['purchase.requisition'].search([
        ('state', 'in', ['confirmed', 'done']),
    ]).write({'bz_approval_state': 'approved'})
