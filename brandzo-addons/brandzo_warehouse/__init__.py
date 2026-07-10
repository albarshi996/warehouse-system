# -*- coding: utf-8 -*-
from . import models


def _bz_post_init(env):
    """Grandfather historical records so the new guards don't retro-block them.

    Records created BEFORE this module was installed carry no Brandzo governance
    state, so we stamp the safe/accepted value on already-finalized documents:
      * confirmed/closed purchase agreements -> approved  (S1 guard)
      * completed incoming receipts           -> QC passed (S2 guard)
    """
    env['purchase.requisition'].search([
        ('state', 'in', ['confirmed', 'done']),
    ]).write({'bz_approval_state': 'approved'})

    env['stock.picking'].search([
        ('state', '=', 'done'),
        ('picking_type_id.code', '=', 'incoming'),
    ]).write({'bz_qc_state': 'passed'})
